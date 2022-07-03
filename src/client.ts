import {Dispatch, Heartbeat, Hello} from './messages/control';
import {
	EncapsulatingPayload,
	EncapsulatingServicePayload,
	LeapServiceEvent,
} from './messages/payload';
import {OpCode, PayloadType} from './messages/opcodes';
import {errorMap, unknownError, LeapError} from './messages/errors';
import {EventEmitter} from 'eventemitter3';
import type {MessageEvent, CloseEvent, default as WSWebSocket} from 'ws';

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

const WebSocket: {new (url: string): WSWebSocket} =
	typeof window === 'undefined' ? require('ws') : window.WebSocket;

export declare interface LeapEdgeClient {
	on(
		event: 'connectionStateUpdate',
		listener: (state: LeapConnectionState) => void,
	): this;

	on(event: 'serviceEvent', listener: (state: LeapServiceEvent) => void): this;
}

export class LeapEdgeClient extends EventEmitter {
	public auth: LeapEdgeAuthenticationParameters;
	private socket: WSWebSocket | null;
	private heartbeat: ReturnType<typeof setTimeout> | null;
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
		this.connectionState = LeapConnectionState.IDLE;
	}

	/**
	 * Connect to Leap Edge
	 */
	public connect = () => {
		if (this.socket) {
			console.warn(
				'[Leap Edge] LeapEdgeClient#connect was called during active connection. This is a noop.',
			);

			return;
		}

		this._updateObservedConnectionState(LeapConnectionState.CONNECTING);
		this.socket = new WebSocket(this.options.socketUrl);

		if (!this.socket) {
			return;
		}

		this.socket.addEventListener('message', this._handleSocketMessage);
		this.socket.addEventListener('close', this._handleSocketClose);
	};

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
		if (!this.socket) {
			return;
		}

		if (this.options.debug) console.log('send:', d);
		this.socket.send(JSON.stringify(d));
	};

	private _handleSocketClose = (e: CloseEvent) => {
		if (this.heartbeat) {
			clearInterval(this.heartbeat);
		}

		this.socket = null;
		this.heartbeat = null;

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
			this.sendPayload(OpCode.HEARTBEAT);
		}, int);
	};

	private _updateObservedConnectionState = (state: LeapConnectionState) => {
		this.connectionState = state;
		this.emit('connectionStateUpdate', state);
	};
}
