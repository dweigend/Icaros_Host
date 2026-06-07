# Debugging

Purpose: this document defines how humans and LLM agents inspect Icaros Host
pairing diagnostics without relying on unbounded runtime logs.

For the confirmed M5 USB/WLAN/WebSocket pairing root cause, implemented fix, and
verification matrix, see [M5 Pairing Solution](m5-pairing-solution.md).

## M5 Pairing Debug Mode

Normal pairing mode stores no rolling log. The operator console shows only the
current pairing snapshot.

When the operator enables **Debug an** in the M5 USB setup panel, the server
keeps a bounded in-memory ring buffer and writes the same bounded data to:

```txt
.icaros/debug/m5-pairing-debug.json
```

This file is the primary artifact for LLM/debug inspection. It is overwritten on
updates and contains:

- current pairing status
- the last bounded debug events
- redacted server URLs
- redacted pairing tokens

It must not contain:

- WiFi passwords
- cleartext pairing tokens
- unbounded historical logs

## Human UI And Automation CLI

M5 pairing and diagnosis have two operator surfaces, but one implementation
boundary:

| Surface | Primary user | Responsibility |
| --- | --- | --- |
| Web UI at `/` | humans at the station | Start USB pairing, toggle debug mode, inspect the current status, and copy connection URLs. |
| `bun run m5:pairing -- ...` | Coding LLMs, scripts, and repeatable checks | Drive the same Host actions, print redacted state, poll bounded snapshots, and check reachability. |
| Host core | both surfaces | Own pairing state, pairing tokens, USB setup execution, `/ws/device` observations, and debug snapshots. |

The CLI must stay a thin automation surface over the running Host. It should call
the Host JSON diagnostics endpoint at `/api/m5-pairing`, while the web console
uses Svelte actions. `/api/m5-pairing` is diagnostics-only for CLI and
automation; it is not a public UI helper API, not an experience API, and not a
second pairing implementation. Both transports must call the same Host core.
The CLI must not fork its own pairing state machine, generate an independent
pairing token, parse raw M5 frames as a second authority, or write
firmware/configuration through a separate adapter-repo workflow.

Anti-pattern: do not duplicate M5 pairing logic in the CLI. If pairing behavior
changes, change the Host core first and keep the web UI and CLI as clients of
that boundary.

## CLI Commands

Start the Host before using CLI commands that call the console or WebSocket
endpoints:

```sh
bun start
```

For Quest `/launch` debugging, follow
[Quest HTTPS Launch Routing](quest-https-launch-routing.md): the experience
client must register an HTTPS `url`, and the operator must select that concrete
online runtime client before opening `/launch`.

Use one stable origin per run. For Quest/LAN debugging, prefer the LAN HTTPS
origin:

```sh
export ICAROS_M5_HOST_ORIGIN=https://<host-lan-ip-or-name>:5183
```

Common commands:

```sh
bun run m5:pairing -- help
bun run m5:pairing -- env
bun run m5:pairing -- info --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- lan --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- url --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- debug-on --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- snapshot
bun run m5:pairing -- health --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- protocols --host-origin "$ICAROS_M5_HOST_ORIGIN"
```

For hardware tests, the Host uses a stable local fallback token from
`.icaros/secrets/m5-device-pairing-token` unless `ICAROS_DEVICE_PAIRING_TOKEN`
is explicitly set. This keeps an already configured M5 URL valid after a Host
restart. Debug output must never print the clear token. Device upgrade logs show
only `hasPairing`, a short token fingerprint, `Sec-WebSocket-Protocol`,
`Origin`, and the accept/reject decision.

On Host startup, the server loads `.icaros/m5-controller.toml` and waits for the
stored controller over WLAN/WebSocket. A found controller turns the M5 setup
state green; missing setup, stale token fingerprint, or timeout leaves it red.

Use `lan` when USB configuration succeeds but the Host never logs a
`websocket` debug line. It prints non-secret LAN facts for LLM triage: Host
health, listener ports, local IPv4 interfaces, WiFi association state, and ARP
neighbors on the controller subnet.

Pair through the same Host action as the web console:

```sh
ICAROS_M5_WIFI_SSID="<wifi-name>" \
ICAROS_M5_WIFI_PASSWORD="<wifi-password>" \
bun run m5:pairing -- pair --host-origin "$ICAROS_M5_HOST_ORIGIN"
```

The `pair` command enables debug mode, posts to the Host USB setup action, and
polls `/api/m5-pairing` until the Host reports success, failure, or timeout.
The endpoint returns the Host-owned bounded snapshot state; the CLI does not
read `.icaros` directly and does not edit the M5 adapter repository.

## Debug Event Sources

- `system`: server-side pairing state changes
- `script`: USB setup script output
- `stderr`: setup script errors
- `event`: structured `PAIRING_EVENT` updates from the USB script
- `websocket`: paired `/ws/device` frame observations

## Agent Checklist

1. Read `.icaros/debug/m5-pairing-debug.json` if it exists.
2. Check `status.state`, `status.step`, `status.error`, `status.usbOk`, and
   `status.wlanOk`.
3. Confirm that URLs and tokens are redacted before sharing output.
4. Do not infer success from USB alone. Pairing is ready only when
   `status.state` is `ready` and `status.wlanOk` is `true`.
