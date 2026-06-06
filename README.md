# Icaros Host

Purpose: this README explains the current Icaros Host MVP after the UI was
collapsed into one technical console page.

## Current MVP Shape

Icaros Host is the station router, gateway, and translator for one local
station. The host owns station state, device input, runtime sockets, and
active experience routing. The UI is intentionally one page:

## Installation

Install the project dependencies with Bun:

```sh
bun install
```

The hardware Host requires local TLS files before it can start:

```txt
.certs/icaros-host.pem
.certs/icaros-host-key.pem
```

Create them with the local HTTPS setup described in
[Quest HTTPS Launch Routing](docs/quest-https-launch-routing.md). The Host and
the standalone VR client each need their own certificate files; do not share or
symlink certificates between repos.

## Start

Use one command for the real Host, M5 pairing, and operator console:

```sh
bun start
```

This cleans ports `5183` and `5184`, builds the app, verifies TLS files, and
starts:

```txt
https://localhost:5183/              operator console
https://<host-lan-ip-or-name>:5183/  LAN operator console
ws://<host-lan-ip-or-name>:5184/ws/device
```

The process stays attached to the terminal while the Host is running. Stop it
with `Ctrl-C`.

Use `bun start` for hardware. `bun run dev` and `bun run dev:lan` are disabled
as Host start commands so they cannot accidentally start a plain HTTP workflow.
For isolated Svelte UI work only, use:

```sh
bun run dev:ui-only
```

## Diagnostics

The controller CLI uses the same Host actions as the web console:

```sh
bun run m5:pairing -- health
bun run m5:pairing -- protocols
bun run m5:pairing -- snapshot
bun run m5:pairing -- checklist
```

For USB and firmware work:

```sh
bun run m5:pairing -- probe
bun run m5:pairing -- flash
bun run m5:pairing -- pair
bun run m5:pairing -- abort
```

Pairing debug output is written to:

```txt
.icaros/debug/m5-pairing-debug.json
```

For low-level M5 reachability only, the isolated plain-WebSocket probe listens
on the M5 device boundary:

```sh
bun scripts/m5-device-probe.ts
```

Plain `ws://` is allowed only for the M5 device endpoint. Operator UI,
runtime clients, Quest launch, and experience clients use HTTPS/WSS.

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
There is no HTTP default or fallback. `bun start` automatically configures the
same-host HTTPS client target with `ICAROS_EXPERIENCE_PROTOCOL=https` when no
explicit origin is set. For separate Quest/LAN client machines, start with
`ICAROS_EXPERIENCE_ORIGIN=https://...`.

## Quest And HTTPS

The Meta Quest is still a first-class runtime device in this MVP. It does not
require a dedicated `/vr` route, but it must be able to open the host console
and the active WebXR experience from a secure origin:

```txt
https://<host-lan-name-or-ip>:<port>/
https://<experience-origin>/
wss://<host-lan-name-or-ip>:<port>/ws/runtime
```

The headset must use the LAN HTTPS address because `localhost` on the Quest
points to the headset itself. Quest-facing browser surfaces must support HTTPS,
and runtime sockets loaded from HTTPS must use WSS. The M5 device boundary
remains separate and may use its firmware-compatible plain WebSocket input path.

`/launch` never targets HTTP. WebXR on Quest requires the client origin itself
to be HTTPS. The Host and standalone VR client each own their own certificate
files; do not share or symlink Host certificates into the Client repo.

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
