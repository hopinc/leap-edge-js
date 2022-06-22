import {OpCode} from './opcodes';

export interface EncapsulatingPayload {
	op: OpCode;
	d?: any;
}
