# Icaros Host

Icaros Host is the local station server for VR experiences.

The Host is not the experience. It connects the M5 controller, the operator
console, and external WebXR/VR clients. The headset keeps one fixed Host URL.
The Host decides which registered local client should launch and publishes a
small normalized control stream for experience clients.

Core responsibilities:

- register runtime clients for launch selection
- select one concrete launch client
- redirect `/launch` to that client's HTTPS URL
- receive raw controller data from the M5
- clean, normalize, smooth, and protect controller input
- publish safe controller values on a normalized public stream
- keep Quest/browser surfaces on HTTPS/WSS

## Architecture

![Host runtime routing sketch](docs/assets/host-runtime-routing-sketch.png)

The model is intentionally small:

1. The M5 sends raw controller data only to the Host.
2. Browser or WebXR clients run separately and may register with the Host.
3. The operator console selects one online runtime client.
4. The headset always opens the same Host URL: `/launch`.
5. The Host redirects `/launch` with `307` to the selected client's registered
   HTTPS URL.
6. Controller data is published separately on `/ws/control/main`.

The Host does not stream websites over WebSocket and does not start experience
builds. Experiences render their own WebXR worlds and consume only the public
control stream.

```txt
M5 raw data -> Host -> control.orientation -> Experience
```

The public control payload is small and stable:

```ts
type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	controllerType: 'm5';
}>;
```

`pitch` and `roll` are normalized to `-1..1`. `quality` is `0..1`. Missing,
stale, invalid, or unsafe controller input is published as neutral
`pitch: 0`, `roll: 0`, `quality: 0`.

## Client Endpoints

| Endpoint | Protocol | Client | Purpose |
| --- | --- | --- | --- |
| `/` | HTTPS | Operator browser | Technical console, launch selection, M5 setup |
| `/launch` | HTTPS | Quest/PICO browser | Fixed headset URL; redirects to the selected HTTPS client |
| `/ws/control/main` | WSS | VR experience clients | Public normalized control stream |
| `/ws/runtime` | WSS | VR experience clients | Launch registration, client status, presence |
| `/ws/device` | WS | M5 controller | Firmware-compatible raw controller socket |
| `/health` | HTTPS | CLI, monitoring | Basic reachability check |
| `/api/m5-pairing` | HTTPS JSON | CLI, automation | Diagnostic and pairing adapter for M5 setup |

Experience clients use `/ws/control/main` for controls. They use `/ws/runtime`
only when they should appear in the launch selection. They never connect
directly to the M5 and never parse raw M5 data.

### Experience Client Messages

Registered launch clients send on `/ws/runtime`:

- `client.hello`
- `client.heartbeat`

They may receive on `/ws/runtime`:

- `client.registered`
- `client.rejected`
- `station.state`
- `runtime.clients` for presence and operator state; normal experiences may
  ignore this message

Control subscribers receive on `/ws/control/main`:

- `control.orientation`

The full wire contract is documented in [docs/client-api.md](docs/client-api.md).

## Installation

Requirement: Bun is installed.

```sh
bun install
```

The Host requires local TLS files:

```txt
.certs/icaros-host.pem
.certs/icaros-host-key.pem
```

Setup is described in
[docs/quest-https-launch-routing.md](docs/quest-https-launch-routing.md). Host
and VR clients use separate certificates.

## Start The Server

Normal development and station start:

```sh
bun run build
bun start
```

`bun run build` creates the SvelteKit production output. `bun start` starts that
output, checks TLS, and prints the relevant local, LAN, client, and device URLs.
It does not build again. If the Host or M5 port is already in use, the CLI asks
whether it may use a free replacement port.

The startup summary is shaped like this:

```txt
Icaros Host is running
  Host HTTPS listener: https://0.0.0.0:5183

Local operator UI:
  Open Host locally: https://localhost:5183/

Remote / LAN access:
  Host URL: https://<host-lan-ip-or-name>:5183/
  Headset launch URL: https://<host-lan-ip-or-name>:5183/launch

Connect client via:
  Host origin argument: bun start https://<host-lan-ip-or-name>:5183
  Runtime registration: wss://<host-lan-ip-or-name>:5183/ws/runtime
  Control stream: wss://<host-lan-ip-or-name>:5183/ws/control/main

M5 controller WebSocket:
  Device socket: ws://<host-lan-ip-or-name>:5184/ws/device
```

For fixed station setups, the alias remains:

```sh
bun run start:strict
```

`start:strict` uses the same startup path. Explicit ports such as `PORT` or
`ICAROS_DEVICE_WS_PORT` are not changed silently; if they are occupied, the CLI
asks before using a replacement port.

The Host may start without a configured controller. M5 pairing, firmware
updates, diagnostics, and controller setup run afterward through the console or
CLI, not as part of `bun start`.

The process stays active in the terminal. Stop it with `Ctrl-C`.

For isolated UI work without hardware:

```sh
bun run dev:ui-only
```

`dev:ui-only` is only for local Svelte UI inspection. It does not replace the
HTTPS/WSS Host start for Quest, runtime clients, or M5 devices.

## Usage

1. Start the Host.
2. Open the operator console in a browser.

   Local desktop checks:

   ```txt
   https://localhost:5183/
   ```

   Quest/LAN sessions should use a stable LAN origin:

   ```txt
   https://<host-lan-ip-or-name>:5183/
   ```

3. Set up the M5 controller through the console or CLI.
4. Start a VR experience client separately over HTTPS. The console shows the
   Host origin to pass into the client. A generic client command looks like:

   ```sh
   bun start https://<host-lan-ip-or-name>:5183
   ```

   Client projects may expose a different command. The important part is that
   they receive the Host HTTPS origin and derive WSS URLs from it.

5. The client connects to `/ws/control/main` and optionally sends
   `client.hello` to `/ws/runtime`.
6. Select the concrete runtime client in the operator console.
7. Quest/PICO opens the fixed Host URL:

   ```txt
   https://<host-lan-ip-or-name>:5183/launch
   ```

8. The Host redirects to the selected client's registered HTTPS URL.

If no client is selected, the selected client is stale, or the registered URL is
not HTTPS, `/launch` fails clearly instead of falling back to a default.

The default 3D world is also an external runtime client. It is not rendered or
started by the Host. It registers over `/ws/runtime` with the stable
`experienceId` `icaros-default-world`. If no launch client is selected and
exactly one online default-world client is registered, the Host may select that
concrete client automatically. If it is not online, `/launch` still fails
clearly without fallback.

## Creating New Clients

A new VR client is a standalone WebXR project. It must:

- run over HTTPS
- connect to `wss://<host-origin>/ws/control/main` for controls
- optionally send `client.hello` and then `client.heartbeat` on `/ws/runtime`
- register one concrete HTTPS URL in `client.hello`
- use only public `control.orientation` values for control input
- apply neutral `pitch` and `roll` directly and treat `quality` as signal quality
- use its own TLS certificates

Start with the dedicated client integration reference:

- [ICAROS Client Connection Guide](https://github.com/dweigend/ICAROS_Client_Erstellen/blob/main/Host_Verbindung_Anleitung.md) - minimal TypeScript handshake and control-stream examples for connecting a new external client to Icaros Host.

Example client projects:

- [Icaros VR Client](https://github.com/dweigend/Icaros_VR_Client)
- [Neural Flight Template](https://github.com/dweigend/neural-flight-template)
- [Neural Flight](https://github.com/dweigend/neural-flight)

## Diagnostics

M5 and Host diagnostics run through the CLI:

```sh
bun run m5:pairing -- health
bun run m5:pairing -- protocols
bun run m5:pairing -- snapshot
bun run m5:pairing -- checklist
```

USB and firmware commands:

```sh
bun run m5:pairing -- probe
bun run m5:pairing -- flash
bun run m5:pairing -- pair
bun run m5:pairing -- abort
```

Runtime smoke test against a running Host:

```sh
bun run smoke:runtime
```

## Documentation

| Document | Content |
| --- | --- |
| [docs/host-lifecycle.md](docs/host-lifecycle.md) | Code tour through startup, gateway, launch, M5, and diagnostics |
| [docs/architecture.md](docs/architecture.md) | Architecture boundaries and ownership |
| [docs/client-api.md](docs/client-api.md) | Public contract for VR experience clients |
| [docs/client-connection.md](docs/client-connection.md) | Short Host-side pointer to the external client integration guide |
| [docs/client-prompt.md](docs/client-prompt.md) | Copyable prompt for integrating a new client |
| [docs/quest-https-launch-routing.md](docs/quest-https-launch-routing.md) | HTTPS, Quest/PICO launch, certificates, and troubleshooting |
| [docs/debugging.md](docs/debugging.md) | Debugging and diagnostics |
| [AGENTS.md](AGENTS.md) | Working rules for coding agents |

## Checks

```sh
bun run check
bun run lint
bun run test
bun run build
```

## Hardware

- [M5Stack StickC Plus](https://shop.m5stack.com/products/m5stickc-plus-esp32-pico-mini-iot-development-kit)
- [Meta Quest 3](https://www.meta.com/de/quest/quest-3/)
- [PICO 4 Ultra Enterprise](https://www.picoxr.com/de/products/pico4-ultra-enterprise)
