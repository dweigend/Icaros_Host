# Icaros Experience Client API

Purpose: this document is the canonical interface for browser/WebXR experiences
that connect to Icaros Host. It describes only the public experience-client
contract: public control streams, optional launch registration, and the
checklist student projects should follow. Device pairing, Quest certificate
setup, and `/launch` operations live in
[Quest HTTPS Launch Routing](quest-https-launch-routing.md).

If another prompt or document disagrees with this page, use this page.

## Boundary

An experience is an external browser/WebXR client. It renders its own scene and
connects to the Host public control stream. The Host owns the M5, station
state, normalization, safe-mode behavior, launch selection, and launch routing.

Experience code must not:

- open `/ws/device`
- parse raw M5 frames
- call `/api/m5-pairing`
- decide which runtime client is active
- assume that HTTP is acceptable for Quest/WebXR

Experience code should:

- open the Host control stream at `/ws/control/main`
- optionally register on `/ws/runtime` to appear in the launch selection
- validate incoming messages before using them
- apply only normalized `control.orientation` payloads
- stop movement when `safeMode` is `true`
- close sockets, timers, and listeners during cleanup

## Message Envelope

All public runtime messages use the same envelope:

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

For experience-originated messages, use:

```ts
const source = {
	role: 'experience',
	id: clientId
} as const;
```

`timestamp` is a millisecond Unix timestamp from `Date.now()`. Student clients
should ignore messages with unknown `protocol`, `stationId`, `type`, or payload
shape.

## Client Library

When an experience can import this repository's public library entrypoint, use
the small browser helper:

```ts
import { onMount } from 'svelte';
import { createIcarosExperienceClient } from '$lib';

onMount(() => {
	const client = createIcarosExperienceClient({
		experienceId: 'mountain-flight',
		title: 'Mountain Flight'
	});

	const unsubscribe = client.onOrientation((control) => {
		if (control.safeMode) {
			stopMovement();
			return;
		}

		applyOrientation(control.pitch, control.roll);
	});

	client.start();

	return () => {
		unsubscribe();
		client.dispose();
	};
});
```

Options:

| Option | Type | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `experienceId` | `string` | yes | none | Stable slug for the experience, for example `mountain-flight`. |
| `clientId` | `string` | no | stable `localStorage["icaros.clientId"]` id | Concrete browser or headset instance id. Most experiences should leave this unset. |
| `title` | `string` | no | `document.title` or `experienceId` | Human-readable title shown in the Host console. |
| `streamId` | `string` | no | `main` | Public control stream id used for `/ws/control/:streamId`. |
| `controlPath` | `string` | no | `/ws/control/main` | Explicit Host control stream path. Most experiences should leave this unset. |
| `runtimePath` | `string` | no | `/ws/runtime` | Host runtime WebSocket path. Most experiences should leave this unset. |

The compatibility helper starts in browser lifecycle code, opens the public
control stream, registers for launch selection on `/ws/runtime`, sends
heartbeats after `client.registered`, exposes `onOrientation(...)`, and closes
both sockets in `dispose()`. It does not expose raw device data.

For explicit composition, the helper boundary is split into
`createIcarosControlStreamClient(...)` for control-only clients on
`/ws/control/:streamId` and `createIcarosLaunchRegistrationClient(...)` for
clients that should appear in launch selection on `/ws/runtime`. The shared
`createIcarosExperienceClient(...)` facade composes both for compatibility.

Standalone clients that cannot import this helper should implement the same
contract below. Use [Icaros VR Client](https://github.com/dweigend/Icaros_VR_Client)
as the related standalone client repository.

## Public Control Stream

The M1 public control stream is:

```txt
wss://<host-lan-ip-or-name>:5183/ws/control/main
```

The stream name is server-owned and device-agnostic. Clients should not care
whether the input comes from an M5, joystick, keyboard, or another controller.

## Runtime Socket

The runtime socket is optional for launch registration:

```txt
wss://<host-lan-ip-or-name>:5183/ws/runtime
```

Quest/WebXR setup details are intentionally not repeated here. For certificates,
LAN hostnames, `/launch`, and troubleshooting, use
[Quest HTTPS Launch Routing](quest-https-launch-routing.md).

Plain `ws://` is reserved for the M5 device boundary. Experience clients use
WSS.

## Registration

Create one stable `clientId` per browser or headset instance:

```ts
const storageKey = 'icaros.clientId';
const storedClientId = localStorage.getItem(storageKey);
const clientId = storedClientId ?? crypto.randomUUID();

if (storedClientId === null) {
	localStorage.setItem(storageKey, clientId);
}
```

After the optional runtime socket opens, send `client.hello`:

```json
{
  "protocol": "neural-flight.v1",
  "type": "client.hello",
  "stationId": "station-a",
  "source": {
    "role": "experience",
    "id": "<clientId>"
  },
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

- `experienceId` is the stable experience slug.
- `clientId` identifies this concrete browser or headset instance.
- `url` must be the HTTPS page URL that `/launch` may redirect to.

The Host responds with `client.registered` or `client.rejected`.

```ts
type ClientRegisteredPayload = Readonly<{
	clientId: string;
	selectedForLaunch: boolean;
	selectedLaunchClientId: string | null;
}>;

type ClientRejectedPayload = Readonly<{
	reason: string;
}>;
```

Treat the client as registered only after `client.registered` with the matching
`clientId`. If the Host sends `client.rejected`, close the socket and keep the
experience neutral.

## Heartbeat

After registration, send `client.heartbeat` every 3 to 5 seconds:

```json
{
  "protocol": "neural-flight.v1",
  "type": "client.heartbeat",
  "stationId": "station-a",
  "source": {
    "role": "experience",
    "id": "<clientId>"
  },
  "timestamp": 1760000004000,
  "payload": {
    "clientId": "<clientId>"
  }
}
```

The Host marks clients stale when heartbeats stop. A stale client is not
selectable as a launch target.

## Controls

The Host sends normalized controls on the public control stream:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	safeMode: boolean;
}>;
```

Fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `pitch` | `number` | Normalized forward/backward value in `-1..1`. |
| `roll` | `number` | Normalized left/right value in `-1..1`. |
| `quality` | `number` | Host-provided signal quality in `0..1`. |
| `safeMode` | `boolean` | `true` means neutral safe controls. Stop movement or hold neutral state. |

Use only valid control payloads:

```ts
function applyControl(control: ControlOrientation): void {
	if (control.safeMode) {
		stopMovement();
		return;
	}

	applyOrientation(control.pitch, control.roll);
}
```

If a manual client receives values outside the documented ranges, ignore the
message or clamp defensively before applying movement.

## Station State

The Host may send `station.state` to announce the current launch selection:

```ts
type StationState = Readonly<{
	selectedExperienceId: string | null;
	selectedLaunchClientId: string | null;
}>;
```

Experience clients can use this for neutral UI state, but they must not decide
launch routing locally. The Host console owns launch selection.

## Runtime Client List

The Host may broadcast `runtime.clients` so operator surfaces can show connected
clients:

```ts
type RuntimeClientsPayload = Readonly<{
	selectedLaunchClientId: string | null;
	clients: readonly RuntimeClientSummary[];
}>;
```

Normal student experiences may ignore this message. It is included here so
manual clients can validate and safely ignore it instead of treating it as an
error.

## Student Checklist

- Use a fixed `experienceId` slug and a human-readable title.
- Use a stable per-browser `clientId` from `localStorage`.
- Load the page from HTTPS for headset/WebXR use.
- Open the Host control stream with WSS at `/ws/control/main`.
- Optionally open the Host runtime socket with WSS at `/ws/runtime`.
- Send enveloped `client.hello` and `client.heartbeat` only for launch
  registration.
- Validate every incoming message before using `payload`.
- Apply only `control.orientation`.
- Stop or neutralize movement when `safeMode` is `true`.
- Dispose WebSockets, intervals, animation loops, and listeners.
- Never connect directly to the M5.
- Never call `/api/m5-pairing` from an experience.
