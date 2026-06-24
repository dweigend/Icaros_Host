# Quest HTTPS Launch Routing

Purpose: operational guide for opening a selected external WebXR experience from
a Quest through Icaros Host.

## Model

| Surface | Responsibility | Example |
| --- | --- | --- |
| Host | Console, station state, runtime sockets, `/launch` | `https://<host-lan-ip-or-name>:5183` |
| Experience client | Serves and renders the WebXR app | `https://<client-lan-ip-or-name>:5174` |
| M5 device socket | Firmware-compatible raw input boundary | `ws://<host-lan-ip-or-name>:5184/ws/device` |

Rules:

- Quest uses LAN-reachable URLs, not `localhost`.
- Browser/WebXR surfaces use HTTPS and WSS.
- Plain `ws://` is reserved for the M5 device socket.
- The Host does not serve or start experience builds.
- `/launch` redirects only to the selected online runtime client's registered
  HTTPS URL.

## Start

Host:

```sh
bun run build
bun start
```

Expected Host surfaces:

```txt
https://localhost:5183/
https://<host-lan-ip-or-name>:5183/
ws://<host-lan-ip-or-name>:5184/ws/device
```

Standalone client, for example `Icaros_VR_Client`:

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
bun run setup:https -- --host <client-lan-ip-or-name>
ICAROS_HOST_ORIGIN=https://<host-lan-ip-or-name>:5183 bun run dev
```

PowerShell:

```powershell
Set-Location C:\path\to\Icaros_VR_Client
bun run setup:https -- --host <client-lan-ip-or-name>
$env:ICAROS_HOST_ORIGIN = "https://<host-lan-ip-or-name>:5183"
bun run dev
```

Quest entrypoint:

```txt
https://<host-lan-ip-or-name>:5183/launch
```

## HTTPS Setup

Create Host certificates in this repo:

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
mkcert \
  -key-file .certs/icaros-host-key.pem \
  -cert-file .certs/icaros-host.pem \
  localhost 127.0.0.1 ::1 <host-lan-ip-or-name>
```

PowerShell:

```powershell
winget install FiloSottile.mkcert
mkcert -install
New-Item -ItemType Directory -Force .certs
mkcert `
  -key-file .certs/icaros-host-key.pem `
  -cert-file .certs/icaros-host.pem `
  localhost 127.0.0.1 ::1 <host-lan-ip-or-name>
```

Create client certificates in the client repo. Do not reuse the Host cert files.

Install the mkcert root CA on the Quest:

```sh
mkcert -CAROOT
```

Restart Host and client after certificate changes.

## Runtime Flow

1. Start Host on a LAN HTTPS origin.
2. Start the experience client on its own LAN HTTPS origin.
3. The client opens `/ws/control/main` and optionally `/ws/runtime`.
4. If registered, the client sends `client.hello` with an HTTPS `url`.
5. The operator selects that concrete online runtime client in `/`.
6. Quest opens `/launch`.
7. Host returns `307 Temporary Redirect` to the selected client URL.

Never append `/launch` to the client port. `/launch` belongs only to the Host.

## `/launch` Outcomes

| State | Result |
| --- | --- |
| No selected client | `409` with a clear message. |
| Selected client stale/offline | `409` with a clear message. |
| Client registers HTTP URL | `client.rejected`. |
| Selected HTTPS client online | `307` redirect to its registered URL. |

## Environment

Host:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5183` | Host HTTPS port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `ICAROS_TLS_KEY_FILE` | `.certs/icaros-host-key.pem` | Host TLS key. |
| `ICAROS_TLS_CERT_FILE` | `.certs/icaros-host.pem` | Host TLS certificate. |
| `ICAROS_DEVICE_WS_PORT` | `5184` | Plain M5 WebSocket port. |

Client:

| Variable | Purpose |
| --- | --- |
| `ICAROS_HOST_ORIGIN` | Host HTTPS origin used to build WSS control/runtime URLs. |

The selected runtime client's registered HTTPS `url` is the only launch target.

## Troubleshooting

- Host LAN URL refused: start with `bun start` and confirm the logged LAN URL.
- `/launch` does not redirect: select one online runtime client in `/`.
- Selection disappears: the client disconnected or went stale; reload and
  select the fresh client.
- `client.rejected`: the advertised launch `url` must be HTTPS.
- Quest opens the page but WebXR/WSS fails: install the mkcert root CA on the
  headset and use certs for the exact LAN names/IPs.
- Experience receives no controls: check WSS to `/ws/control/main` and fresh M5
  or simulator frames.
- M5 pairing issues: use [Debugging](debugging.md).
