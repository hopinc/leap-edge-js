import {LeapEdgeClient} from '.';
import {LeapConnectionState} from './client';

const c = new LeapEdgeClient({
	projectId: 'project_MTc2Mzc5ODU1ODIxMDg2NzM',
	token: null,
});
c.connect();

c.on('connectionStateUpdate', (state: LeapConnectionState) => {
	if (state !== LeapConnectionState.CONNECTED) return;

	c.sendServicePayload({e: 'SUBSCRIBE', c: 'abc123', d: null});
});
