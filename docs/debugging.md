# Debugging

Purpose: compact runbook for M5 and Host diagnostics without relying on
unbounded logs.

## Surfaces

| Surface | Use |
| --- | --- |
| Console `/` | Human station operation: pairing, debug toggle, URLs, current state. |
| `bun run m5:pairing -- ...` | Automation and repeatable checks against the running Host. |
| `/api/m5-pairing` | Diagnostics adapter used by the CLI, not an experience API. |

The console and CLI must share the same Host core. Do not add a second pairing
state machine, token generator, or raw-frame parser in the CLI.

## Useful Commands

Start the Host first:

```sh
bun run build
bun start
```

For LAN or Quest sessions, use one stable HTTPS Host origin:

```sh
export ICAROS_M5_HOST_ORIGIN=https://<host-lan-ip-or-name>:5183
```

PowerShell:

```powershell
$env:ICAROS_M5_HOST_ORIGIN = "https://<host-lan-ip-or-name>:5183"
```

Then inspect:

```sh
bun run m5:pairing -- health --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- protocols --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- snapshot --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- checklist --host-origin "$ICAROS_M5_HOST_ORIGIN"
```

USB setup helpers:

```sh
bun run m5:pairing -- probe --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- flash --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- pair --host-origin "$ICAROS_M5_HOST_ORIGIN"
bun run m5:pairing -- abort --host-origin "$ICAROS_M5_HOST_ORIGIN"
```

PowerShell uses `$env:ICAROS_M5_HOST_ORIGIN` in place of
`$ICAROS_M5_HOST_ORIGIN`.

On Windows, Host-triggered USB helpers run the Python script through `uv run`
so the script-local `pyserial` dependency is available for COM ports. Manual
USB probes can use:

```powershell
uv run scripts/connect-m5-usb.py --mode probe --port COM3
```

Runtime contract smoke test:

```sh
bun run smoke:runtime
```

## Debug Snapshot

When debug mode is enabled, the Host writes a bounded redacted snapshot to:

```txt
.icaros/debug/m5-pairing-debug.json
```

It may contain current pairing status, recent debug events, redacted URLs, and
token fingerprints. It must not contain WiFi passwords, clear pairing tokens, or
unbounded historical logs.

## Triage Rules

- Pairing is ready only when Host state is `ready` and WLAN is healthy.
- USB success alone does not prove the controller can reach `/ws/device`.
- The M5 endpoint is plain `ws://<host>:5184/ws/device?pairing=...`.
- Browser/WebXR runtime and control sockets stay WSS on the HTTPS Host origin.
- Experiences never call `/api/m5-pairing` and never connect to `/ws/device`.
