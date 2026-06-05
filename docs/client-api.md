# Icaros Experience Client API

Purpose: this document is a how-to for experience developers who connect a
browser experience to Icaros Host. It describes only the client-facing API and
intentionally leaves out device and hardware internals.

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
| `experienceId` | `string` | yes | none | Unique id of the experience. It must match an installed and activated experience manifest, for example `"echo-flight"`. |
| `clientId` | `string` | no | `crypto.randomUUID()` | Runtime client id sent to the host during registration. Most experiences should leave this unset. |
| `runtimePath` | `string` | no | `"/ws/runtime"` | Runtime WebSocket path on the current host. Most experiences should leave this unset. |

## Client Methods

### `client.start()`

Starts the WebSocket connection to Icaros Host.

Call this normally once when the experience loads. Calling `start()` again while
the client already has a socket is a no-op.

When the socket opens, the client registers itself as an experience with the
configured `experienceId`.

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
message for the active registered experience.

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

The client resolves the runtime socket from the current page:

- `http://...` uses `ws://.../ws/runtime`.
- `https://...` uses `wss://.../ws/runtime`.

If the host sends a station state where the active experience id no longer
matches this client, the client navigates to `/`. This keeps inactive
experiences from continuing to run after the operator changes the active
experience.
