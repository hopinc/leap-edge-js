import {EventEmitter} from 'eventemitter3';
import throttle from 'lodash.throttle';
import type {CloseEvent, MessageEvent, WebSocket as WSWebSocket} from 'ws';
import {Dispatch, Heartbeat, Hello} from './messages/control';
import {errorMap, LeapError, unknownError} from './messages/errors';
import {OpCode, PayloadType} from './messages/opcodes';
import {
	EncapsulatingPayload,
	EncapsulatingServicePayload,
	LeapServiceEvent,
} from './messages/payload';

export const DEFAULT_ENDPOINT = 'wss://leap.hop.io/ws';

export interface LeapEdgeAuthenticationParameters {
	token?: string | null;
	projectId: string;
}

export interface LeapEdgeInitOptions {
	socketUrl: string;
	debug: boolean;
}

export enum LeapConnectionState {
	IDLE = 'idle',
	CONNECTING = 'connecting',
	AUTHENTICATING = 'authenticating',
	CONNECTED = 'connected',
	ERRORED = 'errored',
}

export declare interface LeapEdgeClient {
	on(
		event: 'connectionStateUpdate',
		listener: (state: LeapConnectionState) => void,
	): this;

	on(event: 'serviceEvent', listener: (state: LeapServiceEvent) => void): this;
}

export class LeapEdgeClient extends EventEmitter {
	public auth: LeapEdgeAuthenticationParameters;
	private socket:
		| {type: 'node'; instance: WSWebSocket}
		| {type: 'browser'; instance: WebSocket}
		| null;

	private heartbeat: ReturnType<typeof setTimeout> | null;
	private lastServerHeartbeatAck: number | null;
	private connectionState: LeapConnectionState;
	private options: LeapEdgeInitOptions;

	constructor(
		auth: LeapEdgeAuthenticationParameters,
		opts?: Partial<LeapEdgeInitOptions>,
	) {
		super();
		this.options = {debug: false, socketUrl: DEFAULT_ENDPOINT, ...opts};
		this.auth = auth;
		this.socket = null;
		this.heartbeat = null;
		this.lastServerHeartbeatAck = null;
		this.connectionState = LeapConnectionState.IDLE;
	}

	/**
	 * Connect to Leap Edge
	 */
	public connect = throttle(async () => {
		if (this.socket) {
			console.warn(
				'[Leap Edge] LeapEdgeClient#connect was called during active connection. This is a noop.',
			);

			return;
		}

		const IS_NODE = typeof WebSocket === 'undefined';

		this._updateObservedConnectionState(LeapConnectionState.CONNECTING);

		if (IS_NODE) {
			const mod = await import('ws');

			this.socket = {
				type: 'node',
				instance: new mod.WebSocket(this.options.socketUrl),
			};
		} else {
			this.socket = {
				type: 'browser',
				instance: new WebSocket(this.options.socketUrl),
			};
		}

		if (!this.socket) {
			return;
		}

		// @ts-expect-error
		this.socket.instance.addEventListener('message', this._handleSocketMessage);
		// @ts-expect-error
		this.socket.instance.addEventListener('close', this._handleSocketClose);
		// @ts-expect-error
		this.socket.instance.addEventListener('error', this._handleSocketError);
	}, 1000);

	public sendServicePayload = (payload: EncapsulatingServicePayload) => {
		if (
			!this.socket ||
			this.connectionState !== LeapConnectionState.CONNECTED
		) {
			throw new Error(
				'Attempted to send payload when socket connection was not established or authorized',
			);
		}

		this.sendPayload(0, payload);
	};

	private sendPayload = (op: number, d: any = null): void => {
		void this.encodeSend(d ? {op, d} : {op});
	};

	private encodeSend = (d: unknown) => {
		if (!this.socket || !this.socket.instance.OPEN) {
			return;
		}

		if (this.options.debug) console.log('send:', d);
		this.socket.instance.send(JSON.stringify(d));
	};

	private _resetState = () => {
		if (this.heartbeat) {
			clearInterval(this.heartbeat);
		}

		this.socket = null;
		this.heartbeat = null;
	};

	private _handleSocketError = () => {
		this._updateObservedConnectionState(LeapConnectionState.ERRORED);

		if (this.heartbeat) {
			clearInterval(this.heartbeat);
		}

		this.socket = null;
		this.heartbeat = null;
	};

	private _handleSocketClose = (e: CloseEvent) => {
		this._updateObservedConnectionState(LeapConnectionState.ERRORED);

		this._resetState();

		const errorCode = e.code as LeapError;
		const error = errorMap[errorCode] || unknownError;

		console.warn('[Leap Edge] Client disconnected unexpectedly:', error);

		switch (errorCode) {
			case LeapError.BAD_ROUTE: {
				this.options.socketUrl = e.reason;
				this.connect();
				break;
			}

			default: {
				if (error.reconnect) {
					this.connect();
				}

				break;
			}
		}
	};

	private _handleSocketMessage = (m: MessageEvent) => {
		const data = JSON.parse(m.data.toString()) as EncapsulatingPayload;

		if (data.op == null) {
			console.warn('leap edge received badly formatted payload:', data);
			return;
		}

		if (this.options.debug) console.log('recv:', data);

		this._handleOpcode(data.op, data.d);
	};

	private _handleOpcode = <T extends keyof PayloadType>(
		opcode: T,
		data: PayloadType[T],
	) => {
		switch (opcode) {
			case OpCode.DISPATCH: {
				const d = <Dispatch>data;

				if (d.e === 'INIT') {
					this._updateObservedConnectionState(LeapConnectionState.CONNECTED);
				}

				this.emit('serviceEvent', {
					channelId: d.c,
					eventType: d.e,
					data: d.d,
				});

				break;
			}

			case OpCode.HELLO: {
				this._updateObservedConnectionState(LeapConnectionState.AUTHENTICATING);
				this._setupHeartbeat((<Hello>data).heartbeat_interval);
				this._identify();

				break;
			}

			case OpCode.HEARTBEAT: {
				this.sendPayload(OpCode.HEARTBEAT, {tag: (<Heartbeat>data).tag});

				break;
			}

			case OpCode.HEARTBEAT_ACK: {
				this.lastServerHeartbeatAck = Date.now();
				break;
			}
		}
	};

	private _identify = () => {
		this.sendPayload(OpCode.IDENTIFY, {
			project_id: this.auth.projectId,
			token: this.auth.token,
		});
	};

	private _setupHeartbeat = (int: number) => {
		this.heartbeat = setInterval(() => {
			this._sendHeartbeat();
		}, int);
	};

	private _sendHeartbeat = (optimisticResolution?: boolean) => {
		this.sendPayload(OpCode.HEARTBEAT);

		const sendTs = Date.now();
		setTimeout(
			() => this._validateHeartbeatAck(sendTs, optimisticResolution),
			optimisticResolution ? 750 : 5000,
		);
	};

	private _validateHeartbeatAck = (hbtSendTs: number, or?: boolean) => {
		const diff =
			this.lastServerHeartbeatAck && this.lastServerHeartbeatAck - hbtSendTs;

		if (diff && diff >= 0 && diff < 5000) {
			return;
		}

		if (or) {
			console.log(
				'[Leap Edge] Optimistic resolution failed. Hard reconnecting...',
			);

			this.socket?.instance.close();
			this._updateObservedConnectionState(LeapConnectionState.ERRORED);
			this._resetState();

			return;
		}

		console.warn(
			"[Leap Edge] Leap didn't respond to heartbeat in time. Attempting optimistic heartbeat resolution",
		);

		this._sendHeartbeat(true);
	};

	private _updateObservedConnectionState = (state: LeapConnectionState) => {
		this.connectionState = state;
		this.emit('connectionStateUpdate', state);
	};
}
