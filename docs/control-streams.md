# Control Streams

Purpose: this document defines the public normalized control stream naming
contract. The Host owns controller hardware and exposes device-agnostic control
streams to experience clients.

## M1 Default

M1 has one controller input and one public stream:

```txt
/ws/control/main
```

`main` is the default stream id when no local control-stream config exists. The
server-owned default mapping is:

```json
{
  "streams": [
    {
      "streamId": "main",
      "label": "ICAROS_1_M5",
      "inputId": "station-a-m5"
    }
  ]
}
```

The public stream name is stable for clients. Hardware-specific details such as
M5, joystick, keyboard, firmware timestamps, or device ids remain Host-private.

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

- This M1 slice does not implement multi-controller routing.
- Clients must not branch on controller hardware type.
- Clients must not read `/ws/device` or parse raw M5 frames.
