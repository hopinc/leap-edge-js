import {OpCode} from './opcodes';

export interface EncapsulatingPayload {
	op: OpCode;
	d?: any;
}

export interface EncapsulatingServicePayload {
	c: string | null;
	u?: boolean;
	e: string;
	d: Record<string, any> | null;
}

/**
 * Friendly version of EncapsulatingServicePayload
 */
export interface LeapServiceEvent {
	channelId: string | null;
	eventType: string;
	data: Record<string, any> | null;
}
