# Historical M5 Pairing Solution

Purpose: this document summarizes the confirmed M5 USB/WLAN/WebSocket root
cause, the implemented fix, and reproducible verification commands. It is a
historical fix report, not the live station runbook. Current diagnostics live in
[Debugging](debugging.md).

## Historical Outcome

The June 2026 fix proved that the M5 controller could connect over WLAN to the
Host plain device WebSocket and stream accepted controller frames.

Verified endpoint shape:

```txt
ws://<host-lan-ip>:5184/ws/device?pairing=redacted
```

Verified Host snapshot:

```txt
state=ready
usbOk=true
wlanOk=true
lastFrameAt=<set>
```

Verified socket state:

```txt
<host-lan-ip>:5184-><m5-lan-ip>:<m5-port> ESTABLISHED
```

## Root Cause

The failure was caused by duplicated server module state in the production Host
process.

`server/index.ts` imports the WebSocket gateway from `src/lib/server/...`, while
the SvelteKit request handler is loaded from `build/handler.js`. That production
handler contains bundled copies of server modules. Without a configured
`ICAROS_DEVICE_PAIRING_TOKEN`, the two module worlds generated separate random
fallback pairing tokens:

- the Web/API side generated the URL written to the M5 over USB
- the WebSocket gateway validated `/ws/device` upgrades with a different token

The M5 had working WLAN and TCP reachability, but the Host rejected the
WebSocket upgrade before pairing could become ready.

## Fix

The Host now shares process-local pairing runtime state through stable
`globalThis` keys:

- `src/lib/server/device/pairing.ts`
  - shares the fallback device pairing token across src imports and bundled
    handler imports
  - still prefers an explicit `ICAROS_DEVICE_PAIRING_TOKEN`
- `src/lib/server/device/usb-setup.ts`
  - shares pairing status, debug lines, and WLAN timeout state across the same
    module worlds
- `src/lib/server/ws/gateway.ts`
  - records redacted TCP/upgrade diagnostics for `/ws/device`
- `scripts/connect-m5-usb.py`
  - sends `diagnose` first and reads until `diagnoseResult` before legacy probes
  - keeps firmware upload opt-in and reads pairing config from stdin

## Best Practices

The Host now keeps its fallback pairing token in a local ignored secret file:

```txt
.icaros/secrets/m5-device-pairing-token
```

That makes a USB-configured controller reconnect after a Host restart without
requiring an environment variable. You can still override the local secret with
an explicit stable token when an operator workflow needs that:

```sh
export ICAROS_DEVICE_PAIRING_TOKEN="<stable-local-token>"
```

Keep tokens out of logs and shell history where possible. The Host, CLI, and
debug snapshots must only show redacted URLs or short fingerprints.

On Host startup, the saved controller setup in `.icaros/m5-controller.toml` is
loaded and the Host waits for the controller over WLAN/WebSocket. The console is
green when a paired frame arrives and red when no saved setup exists, the saved
token fingerprint is stale, or the controller does not reconnect before the
startup discovery timeout.

For Quest/WebXR:

- keep the Host UI/runtime on HTTPS/WSS at `https://<host-lan-ip-or-name>:5183`
- keep the M5 on plain WS at `ws://<host-lan-ip-or-name>:5184/ws/device?...`
- do not connect experiences directly to the M5
- route raw M5 frames only through the Host

When pairing fails:

1. Enable debug:
   ```sh
   bun run m5:pairing -- debug-on --host-origin https://<host-lan-ip-or-name>:5183
   ```
2. Read the snapshot:
   ```sh
   bun run m5:pairing -- snapshot --host-origin https://<host-lan-ip-or-name>:5183
   ```
3. Check the controller diagnose output:
   - `wifiStatus=3`
   - `localIp=<m5-ip>`
   - `tcpProbeOk=true`
   - `webSocketConnected=true`
4. Interpret failures:
   - TCP connection plus invalid-token reject: stale or mismatched pairing URL
   - `tcpProbeOk=false`: LAN/firewall/AP isolation/routing issue
   - USB telemetry only: firmware is alive, but WLAN/WebSocket is not yet ready

## Historical Verification Matrix

Historical verification command set from the fix period:

```sh
bun run lint
bun run test
bun run check
bun run build
bun run firmware:m5:build
bun run m5:pairing -- snapshot --host-origin https://<host-lan-ip>:5183
```

Observed:

- Biome full lint passed
- Vitest passed: 5 files, 30 tests
- Svelte check passed: 0 errors, 0 warnings
- production build passed
- PlatformIO firmware build passed
- Host snapshot stayed ready with live paired `orientation` frames

## Acceptance Criteria

The fix is accepted when all of the following are true:

- Host listens on HTTPS `5183`
- Host listens on plain M5 WS `5184`
- M5 stores a redacted `ws://<host-ip>:5184/ws/device?pairing=...` target
- M5 diagnose shows healthy WLAN and valid parsed WS endpoint
- Host snapshot reaches `state=ready`
- Host snapshot shows `usbOk=true`, `wlanOk=true`, and `lastFrameAt`
- Host debug lines show accepted `orientation` or `heartbeat` frames
