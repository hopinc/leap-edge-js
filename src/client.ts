import {Dispatch, Heartbeat, Hello} from './messages/control';
import {EncapsulatingPayload} from './messages/payload';
import {OpCode, PayloadType} from './messages/opcodes';
import {errorMap, unknownError, LeapError} from './messages/errors';
import {EventEmitter} from 'stream';
import type {MessageEvent, CloseEvent, default as WSWebSocket} from 'ws';

const ENDPOINT = 'wss://leap-stg.hop.io/ws';
// const ENDPOINT = "ws://localhost:4001/ws";

interface LeapEdgeAuthenticationParameters {
	token?: string;
	projectId: string;
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

export class LeapEdgeClient extends EventEmitter {
	public auth: LeapEdgeAuthenticationParameters;
	private endpoint: string;
	private socket: WSWebSocket | null;
	private heartbeat: ReturnType<typeof setTimeout> | null;
	private connectionState: LeapConnectionState;

	constructor(auth: LeapEdgeAuthenticationParameters) {
		super();
		this.auth = auth;
		this.endpoint = ENDPOINT;
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
		this.socket = new WebSocket(this.endpoint);

		if (!this.socket) {
			return;
		}

		this.socket.addEventListener('message', d => {
			console.log(d);
		});

		this.socket.addEventListener('message', this._handleSocketMessage);
		this.socket.addEventListener('close', this._handleSocketClose);
	};

	private sendPayload = (op: number, d: any = null): void => {
		void this.encodeSend(d ? {op, d} : {op});
	};

	private encodeSend = (d: unknown) => {
		if (!this.socket) {
			return;
		}

		console.log('send:', d);
		this.socket.send(JSON.stringify(d));
	};

	private _handleSocketClose = (e: CloseEvent) => {
		if (this.heartbeat) clearInterval(this.heartbeat);

		this.socket = null;
		this.heartbeat = null;

		const errorCode = e.code as LeapError;
		const error = errorMap[errorCode] || unknownError;

		console.warn('[Leap Edge] Client disconnected unexpectedly:', error);

		switch (errorCode) {
			case LeapError.BAD_ROUTE: {
				this.endpoint = e.reason;
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
			return console.warn('leap edge received badly formatted payload:', data);
		}

		console.log('recv:', data);

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
