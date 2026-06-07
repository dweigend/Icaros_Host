# Quest HTTPS Launch Routing

Purpose: this document is the canonical operational guide for reaching an
external WebXR experience from a Meta Quest through Icaros Host. It covers LAN
addresses, HTTPS certificates, WSS runtime sockets, `/launch` behavior, and
common failure modes. It does not describe M5 firmware details or experience
asset hosting.

## Mental Model

Icaros Host and the WebXR experience are separate web servers:

| Surface | Responsibility | Example |
| --- | --- | --- |
| Host | Operator console, station state, M5 socket, runtime socket, `/launch` | `https://<host-lan-ip-or-name>:5183` |
| Experience client | Renders the WebXR scene and registers with the Host | `https://<client-lan-ip-or-name>:5174` |
| M5 device socket | Firmware-compatible raw input boundary | `ws://<host-lan-ip-or-name>:5184/ws/device` |

Hard rules:

- The Quest opens LAN-reachable URLs, not `localhost`.
- Browser/WebXR surfaces use HTTPS.
- Runtime sockets from browser/WebXR pages use WSS.
- Plain `ws://` is reserved for the M5 device boundary.
- The Host does not serve or start experience builds.
- `/launch` redirects only to the selected online runtime client's registered
  HTTPS URL.
- `/launch` never redirects to HTTP.

## Runtime Flow

1. Start the Host on a LAN-facing HTTPS address.
2. Start the standalone experience client on its own HTTPS origin.
3. The experience opens `wss://<host-lan-ip-or-name>:5183/ws/runtime`.
4. The experience sends enveloped `client.hello` with its stable `clientId`,
   `experienceId`, title, and HTTPS `url`.
5. The Host accepts the client with `client.registered`.
6. The operator opens `https://<host-lan-ip-or-name>:5183/` and selects the
   concrete runtime client.
7. The Quest opens `https://<host-lan-ip-or-name>:5183/launch`.
8. The Host responds with `307 Temporary Redirect` to the selected client's
   registered HTTPS URL.
9. The selected client receives `control.orientation` while the M5 is live.

Never append `/launch` to the experience client port. `/launch` belongs only to
the Host origin.

## Start Commands

Run the Host from this repository:

```sh
bun start
```

Expected Host surfaces:

```txt
https://localhost:5183/
https://<host-lan-ip-or-name>:5183/
ws://<host-lan-ip-or-name>:5184/ws/device
```

Run the standalone VR client from
`/Users/weigend/Documents/GitHub/Icaros_VR_Client`:

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
bun run setup:https -- --host <client-lan-ip-or-name>
ICAROS_HOST_ORIGIN=https://<host-lan-ip-or-name>:5183 bun run dev
```

For the Quest, open the Host launch URL:

```txt
https://<host-lan-ip-or-name>:5183/launch
```

## HTTPS Setup

WebXR on Quest must run from trusted secure origins. The Host and standalone
client own separate TLS files. Do not share, symlink, or point the client at the
Host certificate files.

Create the Host certificate in this repository:

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
mkcert \
  -key-file .certs/icaros-host-key.pem \
  -cert-file .certs/icaros-host.pem \
  localhost 127.0.0.1 ::1 <host-lan-ip-or-name>
```

Create the standalone client certificate in the client repository:

```sh
cd /Users/weigend/Documents/GitHub/Icaros_VR_Client
bun run setup:https -- --host <client-lan-ip-or-name>
```

Install the mkcert root CA on the Quest so the headset trusts both HTTPS
origins. Find the root CA path with:

```sh
mkcert -CAROOT
```

Restart both servers after certificate changes.

## `/launch` Behavior

`/launch` resolves the selected runtime client at request time:

| State | Result |
| --- | --- |
| No selected runtime client | Clear `409` response. |
| Selected client is no longer online | Clear stale-client response. |
| Selected client registered a non-HTTPS URL | Clear configuration response. |
| Selected online client has an HTTPS URL | `307 Temporary Redirect` to that URL. |

The Host console should show only Quest-safe launch URLs:

```txt
https://<host-lan-ip-or-name>:5183/launch
```

The redirect target is the client's registered HTTPS URL, for example:

```txt
https://<client-lan-ip-or-name>:5174/
```

## Environment Variables

Host process:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5183` through `bun start` | Host HTTPS port. |
| `HOST` | `0.0.0.0` through `bun start` | Network bind address. |
| `ICAROS_TLS_KEY_FILE` | `.certs/icaros-host-key.pem` | TLS key used by the Host process. |
| `ICAROS_TLS_CERT_FILE` | `.certs/icaros-host.pem` | TLS certificate used by the Host process. |
| `ICAROS_DEVICE_WS_PORT` | `5184` | Plain M5 device WebSocket port. |
| `ICAROS_DEVICE_WS_ORIGIN` | derived from Host LAN address and device port | Optional explicit M5 device WebSocket origin. |

Standalone VR client:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ICAROS_DEMO_PORT` | `5174` | Demo client HTTPS port. |
| `ICAROS_HOST_ORIGIN` | `https://localhost:5183` for same-machine checks | Host origin used to build `wss://.../ws/runtime`; set this to the Host LAN HTTPS origin for Quest sessions. |

Do not use environment variables to create a second public launch target. The
selected runtime client's registered HTTPS `url` is the launch target.

## Troubleshooting

`ERR_CONNECTION_REFUSED` for `https://<host-lan-ip-or-name>:5183` usually means
the Host is not running, is on another port, or is bound to loopback only. Start
with `bun start` and confirm the process logs a LAN URL.

`/launch` does not redirect. Open the Host console and confirm one online
runtime client is selected.

`/launch` reports a stale selected client. Reload the experience client, wait
for it to send `client.hello`, then select the fresh online client in the Host
console.

`/launch` rejects the target URL. The experience registered a URL that does not
start with `https://`. Serve the client over HTTPS and make sure its
`client.hello` payload advertises the HTTPS page URL.

The Quest opens the experience but WebXR or WSS fails. Install the mkcert root
CA on the headset and use certificates that include the exact LAN IP or
hostname for both the Host and Client origins.

The experience page opens but receives no controls. Check that the selected
runtime client is online, the M5 or simulator is sending fresh frames, and the
experience waits for `client.registered` before applying controls.

The M5 pairing URL should stay plain `ws://`, but it must point at the device
port, not the HTTPS UI/runtime port. With the default Host, the M5 endpoint is:

```txt
ws://<host-lan-ip-or-name>:5184/ws/device?pairing=...
```

For M5 diagnostics, use [Debugging](debugging.md) and
[M5 Pairing Solution](m5-pairing-solution.md).
