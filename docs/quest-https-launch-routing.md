# Quest HTTPS Launch Routing

Purpose: this document explains how the Meta Quest reaches an externally hosted
WebXR experience through Icaros Host. It covers LAN addressing, HTTPS
certificates, `/launch` redirect behavior, environment overrides, and the most
common failure modes. It does not describe M5 firmware details or static
experience hosting because those are outside the current MVP.

## Mental Model

Icaros Host and the WebXR experience are two different web servers:

| Responsibility | Current default |
| --- | --- |
| Host console, station state, M5 socket, runtime socket, `/launch` | `http(s)://<mac-lan-ip>:5183` |
| Standalone WebXR experience client | `http(s)://<mac-lan-ip>:5174` |

The Quest must open a URL that points to the Mac on the LAN, not to
`localhost`. On the headset, `localhost` means the headset itself.

The host does not start the experience client and does not serve the
experience's built files. It only stores `activeExperienceId`, owns the sockets,
and redirects `/launch` to the externally running active experience URL.

## Runtime Flow

1. Start the host on a LAN-facing address.
2. Start the experience client separately, usually on port `5174`.
3. Open the host console at `http(s)://<mac-lan-ip>:5183/`.
4. Set `activeExperienceId` in the console.
5. Open `http(s)://<mac-lan-ip>:5183/launch` on the Quest.
6. The host responds with `307 Temporary Redirect`.
7. The Quest browser loads the experience at `http(s)://<mac-lan-ip>:5174/`.
8. The experience opens `/ws/runtime`, registers its `experienceId`, and only
   receives controls when that id matches the host's active id.

## Start Commands

Build once, then run the host with the WebSocket gateway:

```sh
bun run build
PORT=5183 bun run serve:lan
```

Use this built server path for end-to-end runtime checks. The normal SvelteKit
Vite dev server can render the console, but it does not attach the Bun
`/ws/runtime` and `/ws/device` gateway.

Run the standalone VR client from `/Users/weigend/Documents/GitHub/Icaros_VR_Client`:

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
ICAROS_HOST_ORIGIN=http://localhost:5183 bun run dev
```

For desktop checks, open:

```text
http://localhost:5183/
http://localhost:5183/launch
http://localhost:5174/
```

For the Quest, replace `localhost` with the Mac's LAN address:

```text
http://<mac-lan-ip>:5183/launch
```

The recent connection-refused case happened when the host was bound to
`localhost` only. Use `serve:lan` or `HOST=0.0.0.0` so another device can reach
the process.

## HTTPS Setup

WebXR on the Quest should be loaded from a secure origin. The host and the
standalone demo client automatically use HTTPS when the expected certificate
files exist.

Create local development certificates with `mkcert`:

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
mkcert \
  -key-file .certs/icaros-host-key.pem \
  -cert-file .certs/icaros-host.pem \
  localhost 127.0.0.1 ::1 <mac-lan-ip>
```

Then restart both servers:

```sh
bun run build
PORT=5183 bun run serve:lan
```

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
ICAROS_HOST_ORIGIN=https://localhost:5183 bun run dev
```

The Quest launch URL becomes:

```text
https://<mac-lan-ip>:5183/launch
```

By default it redirects to:

```text
https://<mac-lan-ip>:5174/
```

The Quest must trust the mkcert root certificate. Find it with:

```sh
mkcert -CAROOT
```

Install that root CA on the headset before testing HTTPS. Otherwise the browser
will show a certificate warning or WebXR may refuse to run as a trusted secure
context.

## `/launch` Behavior

`/launch` resolves the active experience at request time:

- No active experience: `409 No active experience is selected.`
- Invalid active id: `400 Active experience id is invalid.`
- Invalid routing environment: `500` with a specific configuration message.
- Valid active id: `307 Temporary Redirect` to the experience URL.

Default URL construction:

```text
<same request protocol>://<same LAN hostname>:5174/
```

Examples:

| Incoming launch URL | Default redirect |
| --- | --- |
| `http://192.168.50.194:5183/launch` | `http://192.168.50.194:5174/` |
| `https://192.168.50.194:5183/launch` | `https://192.168.50.194:5174/` |
| `http://localhost:5183/launch` | `http://<detected-mac-lan-ip>:5174/` |

Loopback hostnames are rewritten to the first non-internal IPv4 address so the
console can show Quest-safe URLs even when the operator opens the host locally.

## Environment Variables

Host process:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` for `server/index.ts`; use `5183` for this MVP | Host HTTP/HTTPS port. |
| `HOST` | `0.0.0.0` | Network bind address for `bun run serve:lan`. |
| `ICAROS_TLS_KEY_FILE` | `.certs/icaros-host-key.pem` | TLS key used by Host and Vite when present. |
| `ICAROS_TLS_CERT_FILE` | `.certs/icaros-host.pem` | TLS certificate used by Host and Vite when present. |
| `ICAROS_EXPERIENCE_ORIGIN` | none | Full origin override, for example `https://192.168.50.194:5174`. |
| `ICAROS_EXPERIENCE_PROTOCOL` | launch request protocol | `http` or `https` when no full origin override is set. |
| `ICAROS_EXPERIENCE_PORT` | `5174` | Experience client port when no full origin override is set. |
| `ICAROS_EXPERIENCE_PATH` | `/` | Experience path; may contain `{experienceId}`. |

Host Vite dev server:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ICAROS_DEV_HOST` | `0.0.0.0` | LAN-facing Vite dev bind address. |

Standalone VR client:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ICAROS_DEMO_PORT` | `5174` | Demo client port. |
| `ICAROS_HOST_PORT` | `5183` | Host port used when `ICAROS_HOST_ORIGIN` is unset. |
| `ICAROS_HOST_ORIGIN` | `http://localhost:5183` or `https://localhost:5183` when certs exist | Proxy target for `/ws/runtime`. |

## WebSocket Rules

The experience client resolves the runtime socket from the current page:

- `http://...` becomes `ws://.../ws/runtime`.
- `https://...` becomes `wss://.../ws/runtime`.

The standalone VR client proxies `/ws/runtime` back to the host during local
development. That lets the browser experience use the same-origin socket path
while the host still owns the real runtime gateway.

The M5 must connect to `/ws/device`. Experiences must not connect to the M5
directly or parse raw M5 frames.

## Troubleshooting

`ERR_CONNECTION_REFUSED` for `http://<mac-lan-ip>:5183` usually means the host
process is not running, is on another port, or is bound to loopback only. Start
with `PORT=5183 bun run serve:lan` and confirm the process says
`Icaros Host listening on http://0.0.0.0:5183` or
`Icaros Host listening on https://0.0.0.0:5183`.

`http://localhost:5174` works on the Mac but not on Quest because `localhost`
on Quest is not the Mac. Use `http(s)://<mac-lan-ip>:5174/` or open
`http(s)://<mac-lan-ip>:5183/launch`.

`/launch` returns `409` when no active experience id is set. Open the console
and set the id first, for example `mountain-flight`.

The page loads over HTTPS but the socket fails when the experience tries to use
plain `ws://`. Use the public client API or a same-origin `/ws/runtime` URL so
HTTPS pages resolve to WSS.

The Quest shows a certificate warning or WebXR does not start. Install the
mkcert root CA on the headset and use a certificate that includes the exact LAN
IP or hostname in the launch URL.

The experience page opens but receives no controls. Check that the experience
registered the same `experienceId` that the operator marked active and that the
M5 or simulator is sending fresh frames.
