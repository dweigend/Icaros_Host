# Icaros Host

Purpose: this README explains the current Icaros Host MVP after the UI was
collapsed into one technical console page.

## Current MVP Shape

Icaros Host is the station router, gateway, and translator for one local
station. The host owns station state, device input, runtime sockets, and
active experience routing. The UI is intentionally one page:

```txt
/
  single operator console
  station status
  runtime connection URLs
  activeExperienceId action
```

There are no UI subpages in the current MVP. Extra SvelteKit routes that were
previously planned for `/operator`, `/vr`, `/api/*`, and `/experiences/*` were
removed to keep the codebase small and readable.

## Runtime Boundaries

- The M5 sends raw frames only to the host over `/ws/device`.
- The host normalizes raw M5 data into `control.orientation`.
- Runtime clients connect over `/ws/runtime`.
- Experiences receive normalized controls only.
- Experiences do not connect directly to the M5.
- Raw M5 data does not enter Three.js or student experience code.

## Station Model

M1 still targets one physical station:

- station id: `station-a`
- one Meta Quest headset as HTTPS/WebXR runtime device
- one M5 controller
- one active experience id
- one active browser/Quest client instance
- browser-based experience clients that register over WebSocket with `client.hello`
- one operator-facing host console

The host stores:

```ts
{
  activeExperienceId: string | null;
  activeClientId: string | null;
}
```

The single console page reads that state and updates it through a SvelteKit form
action. No separate operator route or JSON API is needed for the MVP UI.

## Experience Routing

The host does not statically serve experience builds in this MVP. An experience
is a browser/WebXR client that opens its own page, connects to the host over
`/ws/runtime`, and registers with `client.hello`.

The operator console shows concrete runtime clients and selects one
`activeClientId`. Only that online client receives `control.orientation` frames.
`activeExperienceId` is still stored for launch compatibility and is derived
from the selected client when the operator chooses a concrete instance.

The `/launch` endpoint is a thin Quest launcher for the active experience. It
redirects the headset only to an explicitly configured HTTPS experience origin.
There is no HTTP default or fallback. If the host is not started with
`ICAROS_EXPERIENCE_PROTOCOL=https` or
`ICAROS_EXPERIENCE_ORIGIN=https://...`, `/launch` returns a clear
configuration error instead of redirecting.

## Quest And HTTPS

The Meta Quest is still a first-class runtime device in this MVP. It does not
require a dedicated `/vr` route, but it must be able to open the host console
and the active WebXR experience from a secure origin:

```txt
https://<host-lan-name-or-ip>:<port>/
https://<experience-origin>/
wss://<host-lan-name-or-ip>:<port>/ws/runtime
```

`http://localhost` is not enough for the headset because `localhost` on the
Quest points to the headset itself. Quest-facing browser surfaces must support
HTTPS, and runtime sockets loaded from HTTPS must use WSS. The M5 device
boundary remains separate and may use its firmware-compatible WebSocket input
path.

For desktop smoke tests the client can still be opened directly on plain
desktop-only origins, but `/launch` never targets HTTP. WebXR on Quest requires
the client origin itself to be HTTPS. The Host and standalone VR client each own
their own certificate files; do not share or symlink Host certificates into the
Client repo.

## Control API

Experiences receive normalized control payloads:

```ts
{
  pitch: number;
  roll: number;
  quality: number;
  source: "m5";
  safeMode: boolean;
  timestamp: number;
}
```

`pitch` and `roll` are normalized to `-1..1`. Stale or disconnected M5 state
produces neutral safe-mode controls.

## Related Docs

- [Architecture](docs/architecture.md)
- [Experience Client API](docs/client-api.md)
- [Implementation Plan](docs/PLAN.md)
- [Coding Standards](CODINGSTANDARDS.md)
- [Agent Rules](AGENTS.md)
