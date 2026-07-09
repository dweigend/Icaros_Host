# Icaros Experience Client API

Purpose: canonical public contract for external browser/WebXR experiences. Host
setup, certificates, and `/launch` operations live in
[Quest HTTPS Launch Routing](quest-https-launch-routing.md).

## Boundary

An experience renders its own scene and consumes Host controls. It must not open
`/ws/device`, parse raw M5 frames, call `/api/m5-pairing`, or decide launch
routing locally.

Use:

- `wss://<host>:5183/ws/control/main` for normalized controls
- optional `wss://<host>:5183/ws/runtime` for launch registration
- HTTPS page URLs for headset/WebXR use
- cleanup for sockets, timers, listeners, and animation loops

## Message Envelope

All public runtime messages use:

```ts
type IcarosMessage<TType extends string, TPayload> = Readonly<{
	protocol: 'neural-flight.v1';
	type: TType;
	stationId: 'station-a';
	source: Readonly<{
		role: 'host' | 'operator' | 'quest' | 'experience' | 'm5';
		id: string;
	}>;
	timestamp: number;
	payload: TPayload;
}>;
```

Experience-originated messages use `source.role: 'experience'` and the concrete
browser/headset `clientId` as `source.id`.

## Browser Helper

When the client can import this repo's public library entrypoint:

```ts
import { createIcarosExperienceClient } from '$lib';

const client = createIcarosExperienceClient({
	experienceId: 'mountain-flight',
	title: 'Mountain Flight',
	hostOrigin: 'https://<host-lan-ip-or-name>:5183'
});

const unsubscribe = client.onOrientation((control) => {
	applyOrientation(control.pitch, control.roll, control.quality);
});

client.start();

// later
unsubscribe();
client.dispose();
```

For explicit composition, use `createIcarosControlStreamClient(...)` for
controls and `createIcarosLaunchRegistrationClient(...)` for launch selection.
The helper derives WSS URLs from HTTPS Host origins and rejects HTTP/WS browser
origins before opening sockets.

## Control Payload

The public control stream is:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

The Host sends:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	buttonPressed: boolean;
	buttonDown: boolean;
	buttonUp: boolean;
	controllerType: 'm5';
}>;
```

`pitch` and `roll` are normalized to `-1..1`. `quality` is `0..1`.
Missing, stale, invalid, or unsafe controller input is published as neutral
`pitch: 0`, `roll: 0`, `quality: 0`. `buttonPressed` is the current button
state. `buttonDown` and `buttonUp` are one-frame edge flags. Missing button
fields default to `false` for backward compatibility.

## Launch Registration

Registration is optional and only needed for clients that should appear in the
Host console launch selection.

Create one stable `clientId` per browser/headset instance, then send
`client.hello` after `/ws/runtime` opens:

```json
{
  "protocol": "neural-flight.v1",
  "type": "client.hello",
  "stationId": "station-a",
  "source": { "role": "experience", "id": "<clientId>" },
  "timestamp": 1760000000000,
  "payload": {
    "role": "experience",
    "clientId": "<clientId>",
    "experienceId": "mountain-flight",
    "title": "Mountain Flight",
    "url": "https://<client-lan-ip-or-name>:5174/",
    "userAgent": "<navigator.userAgent>"
  }
}
```

Rules:

- `clientId` identifies the concrete browser/headset instance.
- `experienceId` is the stable experience slug.
- `url` must be the HTTPS page URL that `/launch` may redirect to.
- Non-HTTPS URLs are rejected with `client.rejected`.

### Default World Contract

The default 3D world is still a normal external runtime client. The Host does
not serve, start, bundle, or render it. A Default World client registers over
`/ws/runtime` like every other launchable experience, but uses the stable
experience id:

```txt
icaros-default-world
```

If no launch client is selected and exactly one online runtime client is
registered with that `experienceId`, the Host may select that concrete client
as the launch target. This is only a convenience selection. `/launch` still
redirects only to the selected registered HTTPS client and fails clearly when
no selected online client exists.

After `client.registered`, send `client.heartbeat` every 3 to 5 seconds:

```json
{
  "protocol": "neural-flight.v1",
  "type": "client.heartbeat",
  "stationId": "station-a",
  "source": { "role": "experience", "id": "<clientId>" },
  "timestamp": 1760000004000,
  "payload": { "clientId": "<clientId>" }
}
```

The Host marks clients stale when heartbeats stop. Stale clients are not valid
launch targets.

## Messages A Client May See

- `control.orientation`: apply only after payload validation.
- `client.registered`: registration accepted.
- `client.rejected`: registration rejected; close the runtime socket.
- `station.state`: current Host launch selection.
- `runtime.clients`: operator presence data; normal experiences may ignore it.

## Checklist

- Serve headset/WebXR pages over HTTPS.
- Pass the Host LAN HTTPS origin when running from a separate client server.
- Use WSS for `/ws/control/main` and optional `/ws/runtime`.
- Validate incoming messages before using payloads.
- Apply only `control.orientation`.
- Dispose sockets, intervals, listeners, and render loops.
- Never connect directly to the M5.
