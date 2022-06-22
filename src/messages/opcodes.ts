import {Dispatch, Heartbeat, HeartbeatAck, Hello, Identify} from './control';

export enum OpCode {
	DISPATCH = 0,
	HELLO,
	IDENTIFY,
	HEARTBEAT,
	HEARTBEAT_ACK,
}

export interface PayloadType {
	[OpCode.DISPATCH]: Dispatch;
	[OpCode.HELLO]: Hello;
	[OpCode.IDENTIFY]: Identify;
	[OpCode.HEARTBEAT]: Heartbeat;
	[OpCode.HEARTBEAT_ACK]: HeartbeatAck;
}
