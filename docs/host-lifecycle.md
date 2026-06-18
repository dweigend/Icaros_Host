# Icaros Host Code Tour

Purpose: short map of the current Host runtime so agents and humans can find
the right boundary before changing code.

## Data Path

```txt
M5 raw frame -> Host normalizer -> control.orientation -> Experience
```

The Host owns M5 pairing, launch selection, runtime presence, normalized
controls, and server-side safety. Experiences render WebXR and consume only:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	controllerType: 'm5';
}>;
```

## Main Entrypoints

| File | Responsibility |
| --- | --- |
| [server/index.ts](../server/index.ts) | Loads the SvelteKit build, starts HTTPS, attaches WebSockets, starts the plain M5 device socket. |
| [src/routes/+page.svelte](../src/routes/+page.svelte) | Composes the single operator console. |
| [src/routes/+page.server.ts](../src/routes/+page.server.ts) | Thin route entry for console `load` and actions. |
| [src/routes/launch/+server.ts](../src/routes/launch/+server.ts) | Returns a `307` redirect or a clear launch error. |
| [src/routes/api/m5-pairing/+server.ts](../src/routes/api/m5-pairing/+server.ts) | CLI/automation diagnostics adapter. |

## WebSocket Runtime

| Path | Owner | Purpose |
| --- | --- | --- |
| `/ws/device` | M5 boundary | Paired raw firmware frames. |
| `/ws/runtime` | Runtime clients | Launch registration, heartbeat, station state, presence. |
| `/ws/control/main` | Public control API | Normalized `control.orientation` for experiences. |

The gateway lives in [src/lib/server/ws/gateway.ts](../src/lib/server/ws/gateway.ts)
and owns sockets, timers, stale-client handling, and `dispose()`.

## Launch Selection

The operator selects one concrete online runtime client. The Host stores
`selectedLaunchClientId` and derives `selectedExperienceId` for compatibility.

| File | Responsibility |
| --- | --- |
| [src/lib/server/station/state.ts](../src/lib/server/station/state.ts) | Station selection state. |
| [src/lib/server/ws/runtime-clients.ts](../src/lib/server/ws/runtime-clients.ts) | Runtime client registry and stale status. |
| [src/lib/server/launch/launch-routing.ts](../src/lib/server/launch/launch-routing.ts) | Validates the selected HTTPS launch target. |

`/launch` never serves assets and never redirects to HTTP.

## M5 And Controls

| File | Responsibility |
| --- | --- |
| [src/lib/server/device/pairing-service.ts](../src/lib/server/device/pairing-service.ts) | Shared pairing core for console and CLI. |
| [src/lib/server/device/pairing.ts](../src/lib/server/device/pairing.ts) | Pairing token and device URL boundary. |
| [src/lib/server/device/usb-setup.ts](../src/lib/server/device/usb-setup.ts) | USB/WLAN setup state. |
| [src/lib/server/control/normalizer.ts](../src/lib/server/control/normalizer.ts) | Converts known M5 fields into public controls. |
| [src/lib/server/control/safety.ts](../src/lib/server/control/safety.ts) | Neutralizes unsafe reconnects and abrupt jumps. |

Missing, stale, invalid, or unsafe input becomes neutral controls with
`pitch: 0`, `roll: 0`, and `quality: 0`.

## Client Helpers

External experiences can use the browser helpers in [src/lib/client](../src/lib/client):

| Helper | Purpose |
| --- | --- |
| `createIcarosControlStreamClient()` | Subscribes to `/ws/control/main`. |
| `createIcarosLaunchRegistrationClient()` | Registers a launch client on `/ws/runtime`. |
| `createIcarosExperienceClient()` | Compatibility facade composing both. |

The public contract is [client-api.md](client-api.md). Quest/LAN setup is
[quest-https-launch-routing.md](quest-https-launch-routing.md).

## Diagnostics

Use the console for station operation and the CLI for repeatable checks:

```sh
bun run m5:pairing -- health
bun run m5:pairing -- protocols
bun run m5:pairing -- snapshot
bun run smoke:runtime
```

Detailed triage lives in [debugging.md](debugging.md).

## Non-Goals

The Host does not render VR worlds, serve experience builds, stream websites
over WebSocket, expose M5 raw frames to experiences, or maintain a second CLI
pairing implementation.
