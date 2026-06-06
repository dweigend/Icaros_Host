# Icaros Experience Client API

Purpose: this document is a how-to for experience developers who connect a
browser experience to Icaros Host. It describes only the client-facing API and
intentionally leaves out device and hardware internals.

For headset URLs, HTTPS certificate setup, and `/launch` redirect behavior, see
[Quest HTTPS Launch Routing](quest-https-launch-routing.md).

## What The Client Does

An experience connects to Icaros Host and receives normalized control data. The
experience does not know raw hardware messages, hardware sockets, or device
protocol details.

The experience should treat Icaros Host as the runtime boundary:

- Connect to the host.
- Register with the experience id.
- Subscribe to normalized orientation controls.
- Ignore controls while `safeMode` is active.
- Clean up the client when the experience unloads.

## Minimal Start

In the Icaros SvelteKit template, import the client factory from the public
library entrypoint. Create and start the client in browser lifecycle code.

```ts
import { onMount } from 'svelte';
import { createIcarosExperienceClient } from '$lib';

onMount(() => {
	const client = createIcarosExperienceClient({
		experienceId: 'echo-flight'
	});

	const unsubscribe = client.onOrientation((control) => {
		if (control.safeMode) {
			return;
		}

		updateExperience({
			pitch: control.pitch,
			roll: control.roll
		});
	});

	client.start();

	return () => {
		unsubscribe();
		client.dispose();
	};
});
```

The client uses `window.location` to resolve the runtime socket, so `start()`
must run in the browser. In SvelteKit, `onMount` is the usual place.

## Factory

### `createIcarosExperienceClient(options)`

Creates a browser-side client for one experience.

```ts
const client = createIcarosExperienceClient({
	experienceId: 'echo-flight'
});
```

Options:

| Option | Type | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `experienceId` | `string` | yes | none | Unique id of the experience. It must match the id the operator marks active in the host console, for example `"echo-flight"`. |
| `clientId` | `string` | no | stable `localStorage["icaros.clientId"]` id | Concrete browser/Quest instance id sent to the host during registration. Most experiences should leave this unset. |
| `title` | `string` | no | `document.title` or `experienceId` | Human-readable title shown in the Host console's runtime client list. |
| `runtimePath` | `string` | no | `"/ws/runtime"` | Runtime WebSocket path on the current host. Most experiences should leave this unset. |

## Client Methods

### `client.start()`

Starts the WebSocket connection to Icaros Host.

Call this normally once when the experience loads. Calling `start()` again while
the client already has a socket is a no-op.

When the socket opens, the client sends `client.hello` with the configured
`experienceId`, a stable concrete `clientId`, the page title, and the current
HTTPS URL. The client treats the runtime as registered only after the host sends
`client.registered`. If the host sends `client.rejected`, the socket closes and
the experience remains neutral.

After registration, the client sends `client.heartbeat` every few seconds so the
Host can keep its available-client list fresh.

The client does not reconnect automatically after a socket close. If the
connection is lost, the experience must call `start()` again or reload.

### `client.onOrientation(callback)`

Registers a callback for normalized orientation controls.

```ts
const unsubscribe = client.onOrientation((control) => {
	// Use control.pitch and control.roll here.
});
```

The callback is called when the host sends a valid `control.orientation`
message for the active registered client instance.

The method returns an unsubscribe function. Call it when this specific listener
is no longer needed.

There is currently no `client.onControl(...)` method. Use
`client.onOrientation(...)` for the normalized control payload.

### `client.dispose()`

Closes the runtime socket and clears all orientation listeners.

Use `dispose()` during page, component, or experience cleanup. Runtime objects
with sockets must always have explicit cleanup.

## Control Payload

The callback receives a `ControlOrientation` object:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	source: 'm5';
	safeMode: boolean;
	timestamp: number;
}>;
```

Fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `pitch` | `number` | Normalized pitch value in the range `-1..1`. |
| `roll` | `number` | Normalized roll value in the range `-1..1`. |
| `quality` | `number` | Host-provided signal quality in the range `0..1`. |
| `source` | `"m5"` | Current protocol source label. Treat this as opaque metadata; experience code should not branch on hardware source labels. |
| `safeMode` | `boolean` | `true` means the host is providing a safe neutral control state. The experience should avoid gameplay or movement updates based on this value. |
| `timestamp` | `number` | Host timestamp for the control update. |

## Recommended Handling

Always check `safeMode` before applying movement.

```ts
client.onOrientation((control) => {
	if (control.safeMode) {
		pauseMovement();
		return;
	}

	applyOrientation(control.pitch, control.roll);
});
```

Use only the normalized values the client exposes. Experience code should not
open hardware sockets, parse device frames, or depend on raw device message
formats.

## Runtime Behavior

The host console exposes a Quest launch URL at `/launch`. That endpoint
redirects to the currently active experience client URL; it does not serve the
experience assets itself.

The client resolves the runtime socket from the current page:

- Direct desktop HTTP pages use `ws://.../ws/runtime`.
- Quest/WebXR HTTPS pages use `wss://.../ws/runtime`.

If the host sends a station state where the active experience id no longer
matches this client, the client navigates to `/`. This keeps inactive
experiences from continuing to run after the operator changes the active
experience.

## Standalone Client Runtime Socket

The browser client builds its WebSocket URL from `window.location.host` plus
`runtimePath`. This means an experience running on port `5174` tries to open:

```text
/ws/runtime
```

on the experience origin first. During local development, the standalone client
proxies that path back to the host. This repository's companion client does
that in
`/Users/weigend/Documents/GitHub/Icaros_VR_Client/vite.config.ts`.

The plain host Vite dev server is not enough for end-to-end runtime checks
because it does not attach the Bun WebSocket gateway. Use the built server entry
point for socket testing:

```sh
bun run build
ICAROS_EXPERIENCE_ORIGIN=https://<client-lan-ip-or-name>:5174 PORT=5183 bun run serve:lan
```

## Local Demo Client

The standalone VR client normally runs HTTPS-only with its own local
certificates:

```text
https://<client-lan-ip-or-name>:5174/
```

When opened through the Quest launch route, the headset must use the host HTTPS
LAN origin first. The host owns `/launch`:

```text
https://<host-lan-ip-or-name>:5183/launch
```

The experience URL is separate and must match the standalone client server.
Plain HTTP is only for direct desktop checks. `/launch` requires an explicit
HTTPS experience target and returns a configuration error instead of redirecting
to HTTP.

```text
https://<client-lan-ip-or-name>:5174/    Quest/WebXR experience target
http://localhost:5174/                  desktop-only fallback if a separate plain client exists
```
