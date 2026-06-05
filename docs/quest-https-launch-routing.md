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
| Host console, station state, M5 socket, runtime socket, `/launch` | `https://<mac-lan-ip>:5183` for Quest/WebXR; HTTP is direct desktop-only |
| Standalone WebXR experience client, no `/launch` endpoint | `https://<mac-lan-ip>:5174` for Quest/WebXR |

Hard rule: Quest/WebXR launch routing has no HTTP default and no HTTP fallback.
`/launch` must either redirect to an explicit HTTPS experience target or fail
with a clear configuration error.

The Quest must open a URL that points to the Mac on the LAN, not to
`localhost`. On the headset, `localhost` means the headset itself.

The host does not start the experience client and does not serve the
experience's built files. It only stores `activeExperienceId`, owns the sockets,
and redirects `/launch` to the externally running active experience URL.
Never append `/launch` to the experience client port `5174`; `/launch` belongs
only to the Host origin on port `5183`.

## Runtime Flow

1. Start the host on a LAN-facing address.
2. Start the experience client separately, usually on port `5174`.
3. Open the host console at `https://<mac-lan-ip>:5183/`.
4. Set `activeExperienceId` in the console.
5. Open `https://<mac-lan-ip>:5183/launch` on the Quest.
6. The host responds with `307 Temporary Redirect`.
7. The Quest browser loads the experience at `https://<mac-lan-ip>:5174/`.
8. The experience opens `/ws/runtime`, registers its `experienceId`, and only
   receives controls when that id matches the host's active id.

## Start Commands

Build once, then run the host with the WebSocket gateway:

```sh
bun run build
ICAROS_EXPERIENCE_PROTOCOL=https PORT=5183 bun run serve:lan
```

Use this built server path for end-to-end runtime checks. The normal SvelteKit
Vite dev server can render the console, but it does not attach the Bun
`/ws/runtime` and `/ws/device` gateway.

Run the standalone VR client from `/Users/weigend/Documents/GitHub/Icaros_VR_Client`:

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
ICAROS_TLS_KEY_FILE=/Users/weigend/Documents/GitHub/Icaros_Host/.certs/icaros-host-key.pem \
ICAROS_TLS_CERT_FILE=/Users/weigend/Documents/GitHub/Icaros_Host/.certs/icaros-host.pem \
ICAROS_HOST_ORIGIN=https://localhost:5183 \
bun run dev
```

For direct desktop checks only, an independently started plain HTTP client may
be opened directly. Do not use `/launch` for HTTP clients, and do not open the
Quest through these URLs:

```text
http://localhost:5183/
http://localhost:5174/
```

For the Quest, use HTTPS and the Mac's LAN address:

```text
https://<mac-lan-ip>:5183/launch
```

The recent connection-refused case happened when the host was bound to
`localhost` only. Use `serve:lan` or `HOST=0.0.0.0` so another device can reach
the process.

## HTTPS Setup

WebXR on the Quest should be loaded from a secure origin. The host and the
standalone demo client each use HTTPS only when that process starts with
readable TLS certificate files. Do not use or recommend an HTTPS client URL if
the client dev server is currently running over HTTP.

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
ICAROS_EXPERIENCE_PROTOCOL=https PORT=5183 bun run serve:lan
```

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
ICAROS_TLS_KEY_FILE=/Users/weigend/Documents/GitHub/Icaros_Host/.certs/icaros-host-key.pem \
ICAROS_TLS_CERT_FILE=/Users/weigend/Documents/GitHub/Icaros_Host/.certs/icaros-host.pem \
ICAROS_HOST_ORIGIN=https://localhost:5183 \
bun run dev
```

The Quest launch URL becomes:

```text
https://<mac-lan-ip>:5183/launch
```

It only redirects when the standalone VR client is also running with TLS and the
host has an explicit HTTPS experience target. Without that configuration,
`/launch` returns `500` with a clear message instead of falling back to HTTP.

For actual Quest WebXR sessions, both browser surfaces need to be secure:

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
ICAROS_TLS_KEY_FILE=/Users/weigend/Documents/GitHub/Icaros_Host/.certs/icaros-host-key.pem \
ICAROS_TLS_CERT_FILE=/Users/weigend/Documents/GitHub/Icaros_Host/.certs/icaros-host.pem \
ICAROS_HOST_ORIGIN=https://localhost:5183 \
bun run dev
```

Then start the Host with an HTTPS experience target:

```sh
cd /Users/weigend/Documents/GitHub/Icaros_Host
ICAROS_EXPERIENCE_PROTOCOL=https PORT=5183 bun run serve:lan
```

Without the explicit HTTPS experience target, the Host refuses `/launch` with a
configuration error. This keeps Quest sessions from silently opening
`http://<mac-lan-ip>:5174/`.

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

Launch URL construction with `ICAROS_EXPERIENCE_PROTOCOL=https`:

```text
https://<same LAN hostname>:5174/
```

This is the experience redirect target only. The Quest launch URL shown in the
console is always an HTTPS Host URL, even if the operator opened a desktop
HTTP console:

```text
https://<host LAN hostname>:5183/launch
```

Examples:

| Configuration | Incoming launch URL | Result |
| --- | --- | --- |
| none | `https://192.168.50.194:5183/launch` | `500 Quest launch requires an HTTPS experience target...` |
| `ICAROS_EXPERIENCE_PROTOCOL=https` | `https://192.168.50.194:5183/launch` | `https://192.168.50.194:5174/` |
| `ICAROS_EXPERIENCE_ORIGIN=https://client.local:9443` | `https://host.local:5183/launch` | `https://client.local:9443/` |
| `ICAROS_EXPERIENCE_ORIGIN=http://client.local:5174` | `https://host.local:5183/launch` | `500 ICAROS_EXPERIENCE_ORIGIN must use https for Quest launch.` |

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
| `ICAROS_EXPERIENCE_ORIGIN` | none | Full HTTPS origin override, for example `https://192.168.50.194:5174`. HTTP origins are rejected. |
| `ICAROS_EXPERIENCE_PROTOCOL` | none | Must be explicitly set to `https` when no full origin override is set. HTTP is rejected. |
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
| `ICAROS_HOST_ORIGIN` | derived from the client dev server protocol | Proxy target for `/ws/runtime`; use `https://localhost:5183` for Quest/WebXR sessions. |

## WebSocket Rules

The experience client resolves the runtime socket from the current page:

- Direct desktop HTTP pages resolve to `ws://.../ws/runtime`.
- Quest/WebXR HTTPS pages resolve to `wss://.../ws/runtime`.

The standalone VR client proxies `/ws/runtime` back to the host during local
development. That lets the browser experience use the same-origin socket path
while the host still owns the real runtime gateway.

The M5 must connect to `/ws/device`. Experiences must not connect to the M5
directly or parse raw M5 frames.

## Troubleshooting

`ERR_CONNECTION_REFUSED` for `https://<mac-lan-ip>:5183` usually means the host
process is not running, is on another port, or is bound to loopback only. Start
with `ICAROS_EXPERIENCE_PROTOCOL=https PORT=5183 bun run serve:lan` and confirm
the process logs the bind address plus at least one openable URL, for example:

```text
Icaros Host listening on https://0.0.0.0:5183
Open locally: https://localhost:5183/
Open on LAN: https://192.168.50.194:5183/
M5 plain device WebSocket listening on ws://0.0.0.0:5184
```

`http://localhost:5174` works only for direct desktop checks. On Quest, open
the HTTPS launch URL `https://<mac-lan-ip>:5183/launch` and make sure the host
has an explicit HTTPS experience target.

`/launch` returns `409` when no active experience id is set. Open the console
and set the id first, for example `mountain-flight`.

The page loads over HTTPS but the socket fails when the experience tries to use
plain `ws://`. Use the public client API or a same-origin `/ws/runtime` URL so
HTTPS pages resolve to WSS.

`/launch` returns `500 Quest launch requires an HTTPS experience target...`.
Start the VR client with the TLS environment above and set
`ICAROS_EXPERIENCE_PROTOCOL=https` or
`ICAROS_EXPERIENCE_ORIGIN=https://<mac-lan-ip>:5174` before starting the host.

The Quest launch opens `https://<mac-lan-ip>:5174/` and Chrome reports
`ERR_SSL_PROTOCOL_ERROR`. The VR client on `5174` is currently plain HTTP. Use
`http://<mac-lan-ip>:5174/` for desktop-only checks, or start the client with
TLS before configuring the Host to redirect to HTTPS.

## Regression History

The HTTPS client-target regression was introduced in commit
`fce6fe7 feat: add Quest launch routing`. That commit created
`src/lib/server/experiences/launch-routing.ts` and defaulted the experience
target protocol to `readHttpProtocol(requestUrl.protocol)`. As a result,
opening `https://<host>:5183/launch` also generated
`https://<host>:5174/`, even when the client server on `5174` was plain HTTP.

The current rule is stricter: `/launch` is always on the Host origin and never
falls back to an HTTP experience target. Missing or HTTP experience
configuration returns `500` with a specific message.

The M5 pairing URL should stay plain `ws://`, but it must not point at the
HTTPS UI/runtime port. With the default HTTPS host, the generated M5 URL is
`ws://<mac-lan-ip>:5184/ws/device?pairing=...`, and the host logs a matching
plain device WebSocket listener. If a different port is required, set
`ICAROS_DEVICE_WS_PORT` before starting the host.

After a successful USB `configureResult`, the Host sends a serial `reboot`
command by default so the controller starts cleanly with the saved WLAN and
WebSocket configuration. Set `ICAROS_M5_REBOOT_AFTER_CONFIGURE=false` only when
you explicitly want to keep the controller running after USB setup.

If pairing still times out and the debug snapshot contains no `websocket`
lines, the controller did not reach the Host's device WebSocket at all. Check
WLAN credentials, 2.4 GHz support, client isolation or guest-network VLANs,
firewall rules for the plain device port, and whether the Host LAN IP in the
M5 URL is reachable from another device on the same network.

The Quest shows a certificate warning or WebXR does not start. Install the
mkcert root CA on the headset and use a certificate that includes the exact LAN
IP or hostname in the launch URL.

The experience page opens but receives no controls. Check that the experience
registered the same `experienceId` that the operator marked active and that the
M5 or simulator is sending fresh frames.
