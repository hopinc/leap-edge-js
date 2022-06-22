// rx
export interface Dispatch {
	[key: string]: any;
}

// rx
export interface Hello {
	heartbeat_interval: number;
}

// tx
export interface Identify {
	project_id: string;
	token?: string;
}

// both
export interface Heartbeat {
	tag?: string;
}

// rx
export interface HeartbeatAck {
	tag?: string;
	latency?: number;
}
