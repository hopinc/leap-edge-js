# leap-edge-js

Utility library for connecting and receiving events from [Leap Edge](https://docs.hop.io/docs/channels/internals/leap). Used for Channels.

## Usage

### Connecting

```ts
import {LeapEdgeClient} from 'leap-edge-js';

const projectId = 'project_xxx';
const token = 'leap_token_xxx';

const leap = new LeapEdgeClient({projectId, token});
leap.connect();
```

> If you don't want to supply a token (e.g. to only connect to unprotected channels), then just don't include the `token` in the authentication parameters object

### Listening for Connection Status Updates

```ts
leap.on('connectionStatusUpdate', (status: LeapConnectionStatus) => {
	// do something with status
});
```

### Listening for Service Events

```ts
leap.on('serviceEvent', ({channelId, eventType, data}: LeapServiceEvent) => {
	// do something
});
```
