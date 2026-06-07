# Icaros Host

Purpose: this README introduces Icaros Host as a teachable HTW student project
and points to the canonical architecture and setup documents.

Icaros Host is the station router, gateway, and translator for one local
ICAROS-style station. It owns device input, station state, normalized controls,
runtime sockets, and active experience routing. It does not render the WebXR
experience itself.

This repository is part of an Icaros project series and continues the direction
started by the [NeuralFlight template](https://github.com/dweigend/neural-flight-template):
keep the host as the stable technical boundary and let student experiences stay
small, readable, and replaceable. Example code should favor explicit types,
file headers, architecture comments at important boundaries, and clear control
flow that students can follow.

## Current MVP Shape

The current MVP has one architecture:

- `/` is the single dense operator console.
- The M5 controller sends raw frames only to the Host.
- The Host validates, normalizes, smooths, and safe-modes controller data.
- Browser/WebXR clients register with `client.hello` on `/ws/runtime`.
- The operator selects one concrete online runtime client.
- `/launch` redirects the headset to that selected client's registered HTTPS
  URL.
- Experiences receive only normalized controls and never talk to the M5.

There are no UI subpages in the MVP. Extra routes that were previously planned
for `/operator`, `/vr`, and `/experiences/*` are intentionally out of scope.

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

Create them with the canonical HTTPS setup in
[Quest HTTPS Launch Routing](docs/quest-https-launch-routing.md). The Host and
the standalone VR client each need their own certificate files.

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

The controller CLI uses the same Host core as the web console and calls the
diagnostic JSON endpoint at `/api/m5-pairing`. That endpoint is for CLI and
automation diagnostics only; it is not a public UI helper API and it is not part
of the experience-client contract.

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

Plain `ws://` is allowed only for the M5 device endpoint. Operator UI,
runtime clients, Quest launch, and experience clients use HTTPS/WSS.

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

`activeClientId` is the routing source of truth. `activeExperienceId` remains
compatibility state derived from the selected client. The single console page
reads that state and updates it through SvelteKit form actions. No separate
operator route or UI helper JSON API is needed for the MVP UI.

## Experience Routing

The host does not statically serve experience builds in this MVP. An experience
is a browser/WebXR client that opens its own page, connects to the host over
`/ws/runtime`, and registers with `client.hello`.

The operator console shows concrete runtime clients and selects one
`activeClientId`. Only that online client receives `control.orientation` frames.
`activeExperienceId` is still stored for launch compatibility and is derived
from the selected client when the operator chooses a concrete instance.

The `/launch` endpoint is a thin Quest launcher for the active runtime client.
It redirects the headset only to the selected online client's registered HTTPS
URL. There is no HTTP default or fallback.

## Quest And HTTPS

The Meta Quest is still a first-class runtime device in this MVP. It does not
require a dedicated `/vr` route, but it must open the Host and active WebXR
experience from secure LAN origins. Operational certificate setup, launch
behavior, environment variables, and troubleshooting live in
[Quest HTTPS Launch Routing](docs/quest-https-launch-routing.md).

Minimum shape:

```txt
https://<host-lan-name-or-ip>:<port>/
https://<experience-origin>/
wss://<host-lan-name-or-ip>:<port>/ws/runtime
```

The headset must use LAN HTTPS addresses because `localhost` on the Quest
points to the headset itself. The M5 device boundary remains separate and may
use its firmware-compatible plain WebSocket input path.

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

For the complete experience-client contract and student checklist, use
[Experience Client API](docs/client-api.md).

## Related Repositories And Hardware

- [NeuralFlight Template](https://github.com/dweigend/neural-flight-template):
  predecessor template for WebXR flight experiments.
- [Icaros VR Client](https://github.com/dweigend/Icaros_VR_Client): standalone
  WebXR client repository that connects to this Host.
- [M5Stack StickC-Plus](https://docs.m5stack.com/en/core/m5stickc_plus):
  compact ESP32 controller hardware used for M5 input experiments.
- [Meta Quest 3](https://www.meta.com/quest/quest-3/): primary WebXR headset
  target for the MVP.
- [PICO 4 Ultra Enterprise](https://www.picoxr.com/global/products/pico4-ultra-enterprise/specs):
  related enterprise headset reference for future lab deployments.

## Related Docs

- [Architecture](docs/architecture.md)
- [Experience Client API](docs/client-api.md)
- [Implementation Plan](docs/PLAN.md)
- [Quest HTTPS Launch Routing](docs/quest-https-launch-routing.md)
- [M5 Pairing Solution](docs/m5-pairing-solution.md)
- [Coding Standards](CODINGSTANDARDS.md)
- [Agent Rules](AGENTS.md)
