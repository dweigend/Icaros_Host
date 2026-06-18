# Control Streams

Purpose: this document defines the public normalized control stream naming
contract. The Host owns controller hardware and exposes device-agnostic control
streams to experience clients.

## V1 Default

V1 has one controller input and one public stream:

```txt
/ws/control/main
```

`main` is the default stream id. The server-owned V1 mapping is intentionally
static:

```json
{
  "streams": [
    {
      "streamId": "main",
      "controllerId": "m5"
    }
  ]
}
```

The array shape is reserved as a future multi-stream extension point. V1 does not
load local stream config files yet. The public stream name is stable for clients,
and hardware-specific details such as M5 field aliases, firmware timestamps, or
device ids remain Host-private.

## Public Payload

Clients should treat `control.orientation` as the complete public control
contract:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	safeMode: boolean;
}>;
```

`pitch` and `roll` are normalized to `-1..1`. `quality` is `0..1`. `safeMode`
is required; when it is `true`, clients should stop movement or hold neutral
state.

## Non-Goals

- This V1 slice does not implement multi-controller routing.
- Clients must not branch on controller hardware type.
- Clients must not read `/ws/device` or parse raw M5 frames.
