# M5 Pairing Test Log

Purpose: this log captures the M5 USB/WiFi/WebSocket diagnostic runs, observed
failure modes, and working hypotheses. It is the source material for a later
diagnosis and best-practice report.

Safety boundary:

- Do not store WiFi passwords in this file.
- Do not store cleartext pairing tokens in this file.
- Do not modify `/Users/weigend/Documents/GitHub/M5_WebSocet_Adapter`.
- Firmware upload is manual and explicit only.

## Current Snapshot

Date: 2026-06-05

Branch: `test/m5-pairing-fixes`

Host runtime:

- UI/runtime: `https://192.168.50.194:5183`
- M5 device WebSocket: `ws://192.168.50.194:5184/ws/device?pairing=redacted`
- Active listener evidence:
  - `bun` PID `74391` listening on TCP `*:5183`
  - `bun` PID `74391` listening on TCP `*:5184`

Latest pairing snapshot:

- `state=failed`
- `step=Fehler`
- `usbOk=true`
- `wlanOk=false`
- `lastFrameAt=<none>`
- `firmwareVersion=0.2.0-icaros-minimal`
- `error=Controller did not connect over WLAN/LAN WebSocket in time.`

Important nuance: USB telemetry is now strong, but Host-side `/ws/device` frame
acceptance is still not proven after the latest run.

## Implemented Test Infrastructure

### Host Device Port

The Host now supports a split transport model:

- HTTPS/WSS remains on `5183` for UI/runtime/Quest.
- Plain M5 device WebSocket uses `5184` when Host runs HTTPS.

Rationale: the current M5 firmware path is plain `ws://`; sending plain WS to an
HTTPS/TLS port fails before the WebSocket upgrade.

### Shared Pairing Core

The Web UI and CLI use the same Host pairing core:

- Human UI: Svelte actions.
- LLM/automation CLI: JSON API at `/api/m5-pairing`.
- Shared server core: `src/lib/server/device/pairing-service.ts`.

Best-practice note: keep CLI as a diagnostic adapter. Do not duplicate pairing
state, token generation, USB setup, or raw frame parsing in the CLI.

### CLI Commands Used

Representative non-secret commands:

```sh
bun run m5:pairing -- health --host-origin https://192.168.50.194:5183
bun run m5:pairing -- protocols --host-origin https://192.168.50.194:5183
bun run m5:pairing -- lan --host-origin https://192.168.50.194:5183
bun run m5:pairing -- pair --host-origin https://192.168.50.194:5183 --timeout-ms 90000
bun run m5:pairing -- snapshot --host-origin https://192.168.50.194:5183
```

Observed:

- `health` returned `PASS 200`.
- `lan` showed both `hostPortListening=yes` and `devicePortListening=yes`.
- Runtime WSS check opened successfully.
- Device WS protocol check was skipped when the CLI process did not have the
  cleartext pairing token in its environment. That is expected and safer than
  leaking the token.

## Firmware Work

New Host-local firmware structure:

- `firmware/m5-controller/platformio.ini`
- `firmware/m5-controller/src/main.cpp`
- `firmware/m5-controller/README.md`

Firmware target:

- M5StickC Plus2 / ESP32
- PlatformIO `m5stick-c` board target
- Libraries: `M5Unified`, `WebSockets`, `ArduinoJson`, `Preferences`, `WiFi`

Firmware features implemented:

- USB Serial JSON Lines at 115200 baud.
- `configure` command.
- Persistent `ssid`, `password`, `serverUrl`, `deviceId`.
- Strict `ws://host:port/path?...` parsing.
- Rejects `wss://`.
- Rejects bracketed/IPv6 hosts.
- Opens plain WebSocket to Host.
- Sends `register`, `heartbeat`, `orientation`.
- Supports `diagnose`.
- Supports `reboot`.
- Mirrors status/telemetry over Serial.

Firmware compile/upload evidence:

```sh
bun run firmware:m5:build
uvx --from platformio platformio run -d firmware/m5-controller -t upload --upload-port /dev/cu.usbserial-5B212401441
```

Observed:

- Compile succeeded.
- Upload succeeded.
- ESP32 was detected as `ESP32-PICO-V3-02`.
- MAC observed during upload: `00:4b:12:c3:09:e4`.

Firmware version observed over USB:

- `0.2.0-icaros-minimal`

## Test Timeline

### 1. Original Failure: HTTPS Port And Plain WS

Initial suspicion:

- Host ran HTTPS on `5183`.
- Firmware/plain M5 path could only use `ws://`.
- A `ws://...:5183/ws/device?...` attempt would hit a TLS-only port and fail.

Result:

- Host was changed so M5 URL is generated as
  `ws://192.168.50.194:5184/ws/device?pairing=redacted` when runtime origin is
  HTTPS.
- Local Host preflight confirmed the plain `5184` listener exists.

Diagnosis status:

- TLS/port mismatch was a real design issue and is fixed by the split port.
- It is no longer the only remaining failure.

### 2. Old Firmware: WiFi Joined But No Host TCP

Evidence from old/controller firmware before replacement:

- USB configure succeeded.
- M5 rebooted.
- Serial heartbeat showed `rssi=-50..-55`.
- ARP suggested a controller IP around `192.168.50.172`.
- Mac could ping that IP.
- Host saw no TCP/WebSocket line on the device port.

Interpretation:

- WLAN join was likely working.
- The old firmware probably did not actually open the configured Host WebSocket,
  or it failed before TCP reached the Mac.

### 3. New Firmware Flash And First USB Probe

After flashing `0.2.0-icaros-minimal`, direct USB probe showed:

- USB telemetry visible.
- `heartbeat` frames with RSSI around `-52..-59`.
- `orientation` frames with numeric `pitch` and `roll`.
- `status` showed:
  - `wifiStatus=3`
  - `localIp=192.168.50.8`
  - in one early run, `webSocketConnected=true`

Important caution:

- `webSocketConnected=true` from firmware alone is not enough to mark Host
  pairing successful. Host snapshot still requires a received `/ws/device`
  frame and `wlanOk=true`.

### 4. USB Configure Timeout Caused By Streaming Telemetry

Failure:

```txt
Setup script error: Timed out waiting for configureResult.
```

Observed cause:

- New firmware streams Serial telemetry continuously.
- When the USB setup script opens the serial port mid-line, the next
  `configureResult` can be glued to a partial telemetry line.
- The script then fails to parse it as a standalone JSON object.

Fix applied:

- `scripts/connect-m5-usb.py` now flushes serial input before sending configure.
- It retries the configure line every few seconds during the configure-result
  timeout.
- This allowed a later pairing run to reach `usbOk=true`.

Best practice:

- Firmware that streams telemetry over Serial must either pause output after a
  setup command or prefix/sequence setup replies so host tooling can recover
  from mid-line attachment.
- Host tooling must tolerate opening serial streams in the middle of a line.

### 5. Host Restart And Fresh Pairing Test

Host was restarted from the current build:

```txt
Icaros Host listening on https://0.0.0.0:5183
Open on LAN: https://192.168.50.194:5183/
M5 plain device WebSocket listening on ws://0.0.0.0:5184
```

Pairing result:

- USB setup passed.
- `usbOk=true`
- Host entered `wlan_test`.
- Host timed out waiting for `/ws/device` frames.
- Snapshot ended with `wlanOk=false`, `lastFrameAt=<none>`.

### 6. Network Reachability After New Firmware

Observed:

- M5 IP from Serial: `192.168.50.8`.
- `ping 192.168.50.8` from Mac succeeded.
- `nc -vz -w 3 192.168.50.194 5184` from Mac succeeded.
- Host listened on `*:5184`.

One earlier run showed an established TCP connection:

```txt
192.168.50.194:5184 -> 192.168.50.8:<ephemeral>
```

Later fresh Host runs did not show an established TCP socket.

Interpretation:

- LAN reachability exists in both directions at least at some points.
- The remaining issue is probably in firmware WebSocket reconnect/handshake
  behavior, token/path handling, or timing around Host restart/pairing state.

### 7. Firmware Diagnose/Status Enhancements

Need discovered:

- The first `diagnoseResult` was often truncated or glued to telemetry.
- `status` did not include enough endpoint detail.
- `wsPath` initially contained the clear pairing token in Serial output.

Fixes started:

- Add short Serial quiet period after Serial commands.
- Add endpoint details to `status`:
  - redacted `serverUrl`
  - `wsHost`
  - `wsPort`
  - redacted `wsPath`
  - `webSocketConfigured`
  - `webSocketConnected`
  - `lastWebSocketError`
- Redact `pairing` inside `wsPath`.
- Change WebSocket reconnect behavior so a configured-but-disconnected client is
  torn down and retried periodically.

Status of these latest firmware changes:

- Source edits are present.
- The reconnect/redaction changes after this point still need a fresh compile,
  flash, and hardware verification because the turn was interrupted during that
  work.

## Problems Tested And Current Read

| Suspect | Evidence | Current read |
| --- | --- | --- |
| HTTPS/TLS mismatch | `ws://` to HTTPS `5183` would fail; split `5184` added. | Fixed as architecture issue. |
| Host not listening | `lsof` shows listeners on `5183` and `5184`. | Not current primary cause. |
| WLAN credentials/join | Serial heartbeat RSSI and `wifiStatus=3`; M5 has IP `192.168.50.8`. | WLAN join works. |
| Mac firewall | Firewall previously checked disabled; local TCP to `5184` succeeds. | Unlikely primary cause. |
| Token leak | Logs and snapshots mostly redacted; one Serial diagnostic exposed token in `wsPath` before redaction fix. | Must keep testing; redaction fix added but needs verification. |
| Firmware Serial protocol | Continuous telemetry can corrupt setup replies. | Host retry/flush fixed most configure failures; firmware quiet period added but not yet verified. |
| Firmware WebSocket reconnect | Status showed `webSocketConnected=false`, `lastWebSocketError=disconnected`; Host saw no frames. | Current leading suspect. |
| Host frame processing | Host marks ready only after parsed `/ws/device` frame. No `lastFrameAt` after latest run. | Needs fresh test after reconnect fix. |

## Best-Practice Notes For Final Report

1. Separate browser/runtime TLS from embedded device transport.
   - Quest/WebXR should stay HTTPS/WSS.
   - M5 MVP can use a separate plain WS device port.

2. Treat USB success and WLAN success as separate gates.
   - USB telemetry proves serial and IMU.
   - RSSI/IP proves WLAN join.
   - Host `lastFrameAt` proves `/ws/device` application traffic.

3. Keep one Host-owned pairing core.
   - Web UI and CLI should be thin clients.
   - Pairing token, debug snapshot, USB setup, and WebSocket observations belong
     in the Host core.

4. Never log secrets.
   - Redact `pairing` in full URLs and in path/query fragments.
   - Do not print WiFi passwords.
   - Do not store cleartext tokens in `.icaros` or docs.

5. Firmware diagnostics must be explicit and machine-readable.
   - `diagnoseResult` should include firmware version, device ID, WiFi status,
     local IP, RSSI, redacted URL, parsed host/port/path, WS configured/connected,
     and last WS error.

6. Serial command handling must tolerate live telemetry.
   - Host should flush and retry.
   - Firmware should briefly quiet telemetry after command receipt.

7. Reconnect should be non-blocking but decisive.
   - Avoid blocking loops.
   - If a WebSocket attempt disconnects, reset configured state and retry after a
     bounded interval.

## Next Test Steps

1. Rebuild and flash the latest firmware source, including reconnect and redacted
   `wsPath` changes.
2. Restart Host from current build on `5183/5184`.
3. Run:

```sh
bun run m5:pairing -- pair --host-origin https://192.168.50.194:5183 --timeout-ms 90000
```

4. During `wlan_test`, check:

```sh
bun run m5:pairing -- snapshot --host-origin https://192.168.50.194:5183
lsof -nP -iTCP:5184
python3 scripts/connect-m5-usb.py --port /dev/cu.usbserial-5B212401441 --server-url 'ws://192.168.50.194:5184/ws/device?pairing=redacted' --seconds 7 --write-probes --skip-firmware-update
```

5. Success criteria:

- Host snapshot: `state=ready`.
- Host snapshot: `wlanOk=true`.
- Host snapshot: `lastFrameAt` is set.
- Debug lines include a `/ws/device` WebSocket connection and at least one paired
  frame.
- Serial `diagnoseResult` shows redacted URL/path and `webSocketConnected=true`.

6. If it still fails:

- Compare firmware `wsHost/wsPort/wsPath` with Host paired URL.
- Check `lsof -nP -iTCP:5184` for an established M5 socket.
- If TCP appears but Host has no frame, inspect WebSocket upgrade/token.
- If TCP never appears, inspect firmware reconnect state and AP/client isolation.

## Delegated Analysis Workstreams

Date: 2026-06-05

The remaining problem was split into parallel subagent workstreams. The purpose
is to collect independent evidence before writing the final diagnosis and
best-practice report.

### Research: Perplexity / Broad Web Search

Agent: `Russell`

Scope:

- Search external evidence for ESP32/M5Stack WebSocket client issues.
- Focus on `links2004/WebSockets`, ESP32 WiFi reconnect behavior, M5Unified
  loop/IMU usage, Serial command protocols with continuous telemetry, and plain
  `ws://` LAN connections.

Expected output:

- Likely known causes with source links.
- WebSocketsClient usage recommendations.
- ESP32 WiFi reconnect recommendations.
- Serial protocol best practices.
- Checklist items for the final report.

Result summary:

- `links2004/WebSocketsClient` examples keep `webSocket.loop()` central and use
  library reconnect support via `setReconnectInterval(...)`.
- Long delays or blocked loops can cause disconnects because ping/pong and
  handshake handling need frequent `loop()` calls.
- `WebSocketsClient.begin(host, port, path, protocol)` defaults protocol to
  `"arduino"`. If the Host does not negotiate subprotocols, testing an explicit
  empty protocol is recommended.
- `ws://` to the plain LAN port is correct for this MVP; `wss://`/TLS work is
  not part of the current fix.
- Serial JSON with continuous telemetry needs strict newline framing,
  non-blocking reads, and enough quiet time around command responses.

Firmware follow-up derived from Russell:

- Prefer `webSocket.setReconnectInterval(3000)` and continuous `webSocket.loop()`
  over repeatedly tearing down configured clients.
- Pass an explicit empty subprotocol to `begin(...)` so Host-side WS upgrade does
  not have to negotiate `"arduino"`.
- Keep Serial telemetry throttled and quiet briefly after command receipt.

### Documentation: Primary Library And Platform Docs

Agent: `Peirce`

Scope:

- Locate official or primary documentation for:
  - `WebSocketsClient`
  - ESP32 Arduino WiFi
  - M5Unified / M5StickC Plus2 IMU
  - ArduinoJson 7
  - PlatformIO M5StickC target

Expected output:

- Source matrix with link, relevant API rule, meaning for this bug, and concrete
  code-review questions.

Result summary:

- `links2004/arduinoWebSockets` examples call `webSocket.onEvent(...)`,
  `webSocket.setReconnectInterval(...)`, and `webSocket.loop()` continuously.
  The current firmware calls `loop()` only while configured/connected and has
  manual reconnect logic; this remains the key review axis.
- `WebSocketsClient.begin(host, port, url, protocol = "arduino")` may send a
  default `Sec-WebSocket-Protocol: arduino` header. Host acceptance should be
  checked via TCP/upgrade evidence if TCP arrives but no paired frames appear.
- ESP32 WiFi docs/source indicate `WiFi.status() == WL_CONNECTED` plus a valid
  local IP proves STA join, but not WebSocket success.
- M5Unified/IMU and ArduinoJson usage look plausible and are unlikely to be the
  reason for missing Host `/ws/device` frames, because `register` and
  `heartbeat` do not depend on IMU.
- PlatformIO `board = m5stick-c` with `espressif32@6.7.0` matches M5StickC Plus2
  guidance.

Peirce's strongest recommendation:

- Compare firmware `diagnoseResult` fields (`wsHost`, `wsPort`, redacted
  `wsPath`, `webSocketConfigured`, `webSocketConnected`, `lastWebSocketError`)
  with Host-side `recordPairedDeviceTcpConnection`, `recordPairedDeviceSocketOpen`,
  and rejected-pairing debug lines.

### Architecture, Problem Solving, And Test Matrix

Agent: `Lagrange`

Scope:

- Read the Host/Firmware code and this log.
- Identify probable causes and missing evidence.
- Build the next hardware-debug checklist.
- Define acceptance criteria for “M5 connects over WiFi and sends data”.
- Add a test-planning matrix for:
  - firmware URL parsing
  - token redaction
  - USB Serial handshake
  - WebSocket reconnect
  - Host snapshot acceptance

Expected output:

- Top causes ranked by probability and proof needed.
- Step-by-step debug checklist.
- Best-practice architecture checklist.
- Test matrix.
- Required log artifacts for the final report.

Result summary:

- Highest-probability causes:
  1. Pairing-token mismatch or stale firmware URL after Host restart.
  2. M5 connects outside the active Host pairing window.
  3. Firmware reconnect is unreliable after Host restart/disconnect.
  4. Stored firmware config has wrong protocol/port/path.
  5. Running Host process may not match current source/build.
- Acceptance requires Host-side proof, not just firmware-side proof:
  - `Plain device TCP connection`
  - `Paired device WebSocket connected`
  - `Paired frame received`
  - snapshot `state=ready`, `usbOk=true`, `wlanOk=true`, `lastFrameAt` set
- For steering data, at least one `orientation` frame with numeric `pitch` and
  `roll` must reach the Host and Runtime must receive non-stale
  `control.orientation`.
- Recommended next hardware run must start with a stable
  `ICAROS_DEVICE_PAIRING_TOKEN`, fresh Host build/process, debug enabled, and
  immediate Serial `diagnoseResult/status` capture during `wlan_test`.

Lagrange's test matrix adds explicit cases for:

- full URL and `wsPath` token redaction
- invalid ports
- mid-line USB configure handling
- Host-start-after-M5 reconnect
- Host-restart-during-connection reconnect
- wrong-token rejection behavior
- safe-mode after M5 disconnect

### Queued Workstream: Intensive Test Worker

Status: queued because the current subagent limit is reached.

Planned scope:

- Add or sharpen pure Host tests for:
  - redacting `pairing` in full URLs and path/query fragments
  - strict `ws://` parsing
  - `wss://`, IPv6, invalid port rejection
  - diagnose payload safety
  - configure validation

### Queued Workstream: Debugging And Refactor Worker

Status: queued because the current subagent limit is reached.

Planned scope:

- Review firmware reconnect state machine.
- Review USB Serial command quieting and host retry behavior.
- Suggest small KISS refactors only where they reduce the current failure risk.
- Avoid broad architecture churn.

## Update: Subagent Results And Firmware 0.2.1 Test

Date: 2026-06-05

### Subagent Results Received

Peirce completed the primary documentation review.

Key takeaways:

- `links2004/WebSocketsClient` examples call `onEvent(...)`,
  `setReconnectInterval(...)`, and then keep `webSocket.loop()` running
  continuously.
- `WebSocketsClient.begin(host, port, url, protocol)` defaults to protocol
  `"arduino"`. If Host does not negotiate a subprotocol, testing an explicit
  empty protocol is useful.
- ESP32 WiFi `wifiStatus=3` plus local IP proves WiFi join but not WebSocket
  success.
- M5Unified/IMU and ArduinoJson are unlikely to be the current root cause,
  because `register`/`heartbeat` do not depend on IMU and USB JSON output is
  valid.
- PlatformIO `m5stick-c` board target with `espressif32@6.7.0` matches the
  M5StickC Plus2 guidance.

Lagrange completed architecture/problem solving/test planning.

Key takeaways:

- Highest-probability causes:
  1. Pairing-token mismatch or stale firmware URL after Host restart.
  2. M5 connects outside the active Host pairing window.
  3. Firmware reconnect unreliable after Host restart/disconnect.
  4. Wrong stored protocol/port/path in firmware config.
  5. Running Host process not matching current source/build.
- Acceptance requires Host-side proof:
  - plain TCP connection on device port
  - WebSocket connection accepted
  - paired frame received
  - snapshot `state=ready`, `wlanOk=true`, `lastFrameAt` set
- Additional test cases should cover token redaction in `wsPath`, invalid ports,
  mid-line USB configure handling, Host restart reconnect, wrong-token rejection,
  and safe-mode after disconnect.

Russell completed broad Web/Perplexity-style research.

Key takeaways:

- `webSocket.loop()` must not be starved by delays or blocking serial/network
  loops.
- Prefer `setReconnectInterval(...)` over manually tearing down handshakes
  repeatedly.
- Explicitly testing empty WebSocket subprotocol may help if a server does not
  negotiate the default `"arduino"` subprotocol.
- Serial telemetry and command replies on one line-oriented transport need
  strict framing and quiet windows.

### Firmware Changes After Subagent Feedback

Firmware file: `firmware/m5-controller/src/main.cpp`

Changes made:

- Version bumped from `0.2.0-icaros-minimal` to `0.2.1-icaros-minimal`.
- WebSocket client now uses library reconnect support:
  - `webSocket.setReconnectInterval(WebSocketReconnectIntervalMs)`
  - keeps `webSocketConfigured=true` after `DISCONNECTED`/`ERROR`
  - keeps calling `webSocket.loop()` while configured
- WebSocket begin call now passes explicit empty subprotocol:
  - `webSocket.begin(host, port, path, "")`
- `wsPath` is redacted in firmware status/diagnose output.
- `status` now includes redacted endpoint details:
  - `serverUrl`
  - `wsHost`
  - `wsPort`
  - `wsPath`
  - `webSocketConfigured`
  - `webSocketConnected`
  - `lastWebSocketError`
- `diagnoseResult` was extended with `tcpProbeOk`, intended to prove raw TCP
  reachability from the M5 to the Host device port independent of WebSocket.

Host USB script changes:

- `scripts/connect-m5-usb.py` now prints longer safe JSON summaries, so
  `webSocketConnected` and `lastWebSocketError` are visible.
- `tcpProbeOk` was added to the public safe summary keys.
- Probe commands were changed to flush serial input before sending a probe.

Important follow-up: flushing before every probe appears too aggressive. The
latest probe run sent `diagnose`, then flushed before subsequent probes, likely
discarding the `diagnoseResult` before it could be read. This must be corrected
so only the stale input before the first probe is flushed, or so the script sends
one command and reads its response before sending/flushing the next.

### Verification Commands Run

Firmware compile:

```sh
bun run firmware:m5:build
```

Result:

- Success.
- Firmware binary built for `m5stick-c-plus2`.
- Flash usage about `84.4-84.5%`.

Host tests:

```sh
bun run test
```

Result:

- Success.
- `5` test files passed.
- `28` tests passed.

Firmware upload:

```sh
uvx --from platformio platformio run -d firmware/m5-controller -t upload --upload-port /dev/cu.usbserial-5B212401441
```

Result:

- Success.
- ESP32 detected as `ESP32-PICO-V3-02`.
- MAC observed during upload: `00:4b:12:c3:09:e4`.

Host listener check:

```sh
lsof -nP -iTCP:5183 -sTCP:LISTEN
lsof -nP -iTCP:5184 -sTCP:LISTEN
```

Observed:

- `bun` PID `74391` listening on TCP `*:5183`.
- `bun` PID `74391` listening on TCP `*:5184`.

Host health:

```sh
bun run m5:pairing -- health --host-origin https://192.168.50.194:5183
```

Observed:

- `PASS configured: https://192.168.50.194:5183/health -> 200`

### Firmware 0.2.1 Pairing Run

Command:

```sh
bun run m5:pairing -- pair --host-origin https://192.168.50.194:5183 --timeout-ms 125000
```

Observed states:

- `state=usb_connected`
- `state=firmware_check`
- `state=usb_test`
- `state=wlan_test`

Snapshot during `wlan_test`:

- `usbOk=true`
- `wlanOk=false`
- `lastFrameAt=<none>`
- `firmwareVersion=0.2.1-icaros-minimal`

No established TCP connection was visible on `5184` during the sampled check:

```txt
bun PID 74391 TCP *:5184 (LISTEN)
```

No Host-side paired frame was observed in the snapshot.

### Firmware 0.2.1 Serial Probe

Command:

```sh
python3 scripts/connect-m5-usb.py --port /dev/cu.usbserial-5B212401441 --server-url 'ws://192.168.50.194:5184/ws/device?pairing=redacted' --seconds 7 --write-probes --skip-firmware-update
```

Observed:

- Firmware version: `0.2.1-icaros-minimal`
- USB telemetry visible.
- Heartbeats visible.
- Orientation frames visible.
- `rssi` around `-51` to `-55`.
- Status frame:
  - `wifiStatus=3`
  - `localIp=192.168.50.8`
  - `wsHost=192.168.50.194`
  - `wsPort=5184`
  - `wsPath=/ws/device?pairing=redacted`
  - `webSocketConfigured=true`
  - `webSocketConnected=false`
  - `lastWebSocketError=disconnected`
  - `serverUrl=ws://192.168.50.194:5184/ws/device?pairing=redacted`

Interpretation:

- WiFi is working.
- Stored firmware endpoint is correct and redacted in output.
- WebSocket client is configured but disconnected.
- At the sampled times, Host saw only a listener on `5184`, not an established
  TCP connection.
- The critical missing evidence is now `tcpProbeOk` from `diagnoseResult`; the
  current probe script likely flushed that response before reading it.

### Current Root-Cause Narrowing

Strongly supported:

- USB path works.
- Firmware `0.2.1` is flashed and running.
- WiFi join works.
- M5 has IP `192.168.50.8`.
- RSSI is healthy.
- Firmware stores the expected Host/port/path.
- Host is listening on `5184`.

Still not proven:

- Raw M5-to-Host TCP connect after latest firmware.
- WebSocket upgrade success.
- Host frame receipt.

Current leading possibilities:

1. M5 raw TCP to Host fails intermittently or after Host/pairing timing changes.
2. `WebSocketsClient` disconnects before or during TCP/upgrade.
3. Host accepts TCP only briefly, but sampling misses it; Host debug snapshot did
   not show the expected TCP debug line in the latest run.
4. Probe tooling is still losing the most important `diagnoseResult` response.

### Immediate Next Fix

Do not change architecture yet. First fix probe sequencing:

- Flush serial input once before the first probe command.
- Send `diagnose`.
- Read until `diagnoseResult` or timeout.
- Only then optionally send legacy probes like `statusRequest`, `getConfig`,
  `startTelemetry`.

Expected next proof:

- If `tcpProbeOk=true` and Host still receives no WebSocket frames, focus on
  WebSocket library handshake/subprotocol/path.
- If `tcpProbeOk=false`, focus on M5-to-Host network path, AP isolation, firewall,
  or routing despite Mac-to-M5 ping.

## 2026-06-05 20:17 CEST - Protocol Update

Context:

- Active branch: `test/m5-pairing-fixes`
- Working tree still contains the M5 pairing/firmware diagnostic changes; no
  revert or destructive git action was performed.
- Host process is still alive as `bun` PID `74391`.

Port check:

```sh
lsof -nP -iTCP:5183 -sTCP:LISTEN
lsof -nP -iTCP:5184 -sTCP:LISTEN
```

Observed:

- PID `74391` listens on TCP `*:5183`.
- PID `74391` listens on TCP `*:5184`.

Additional code inspection:

```sh
rg -n "diagnoseResult|write_probe_messages|flush_serial_input|PROBE_MESSAGES" scripts/connect-m5-usb.py
```

Relevant result:

- `PROBE_MESSAGES` starts at line `44`.
- `write_probe_messages` starts at line `616`.
- `flush_serial_input(fd)` is currently called at line `618`, inside the loop
  before each probe message.

New finding:

- The latest missing `diagnoseResult` is now very likely a host-side diagnostic
  tooling problem, not proof that the firmware failed to answer.
- Because the probe loop flushes serial input before every individual probe,
  a valid response from the previous probe can be discarded immediately before
  the next probe is written.
- This especially affects the new high-value `diagnose` command, because its
  `diagnoseResult.tcpProbeOk` field is the decisive split between:
  - network/TCP path problem, and
  - WebSocket handshake/path/subprotocol problem.

Review note:

- The CLI review comment on `scripts/m5-pairing-cli.ts` line `312` requested:
  "immer early returns".
- This should be handled in the next refactor pass while preserving the core
  rule that CLI and Web UI share the same Host pairing service/API.
- The review is structural/maintainability feedback; it is not currently the
  blocker for M5 WLAN/WebSocket pairing.

Updated immediate checklist:

1. Fix `scripts/connect-m5-usb.py` probe sequencing with minimal scope.
2. Flush serial input once before the first probe only.
3. Send `{"type":"diagnose"}` as a first-class probe.
4. Read until `diagnoseResult` or timeout before sending legacy probes.
5. Keep all URL/token output redacted.
6. Re-run USB serial probe and capture:
   - `diagnoseResult.firmwareVersion`
   - `diagnoseResult.wifiStatus`
   - `diagnoseResult.localIp`
   - `diagnoseResult.wsHost`
   - `diagnoseResult.wsPort`
   - redacted `diagnoseResult.wsPath`
   - `diagnoseResult.webSocketConfigured`
   - `diagnoseResult.webSocketConnected`
   - `diagnoseResult.lastWebSocketError`
   - `diagnoseResult.tcpProbeOk`

Decision gate after next probe:

- `tcpProbeOk=false`: investigate AP isolation, macOS firewall, routing, or
  M5-to-Host reachability on TCP `5184`.
- `tcpProbeOk=true` plus no Host frames: investigate WebSocket upgrade details,
  including request path, query token validation, subprotocol, and early
  disconnect timing.

Current status:

- Root cause is narrowed but not closed.
- Firmware, USB configure, WiFi join, stored endpoint, Host listener, and serial
  telemetry are proven.
- M5-to-Host TCP connect is still the next missing proof.

## 2026-06-05 20:23 CEST - Side-Thread Status Update

Context:

- Active branch: `test/m5-pairing-fixes`
- Host is still running as `bun` PID `74391`.
- Current listeners:
  - TCP `*:5183`
  - TCP `*:5184`
- No listener was observed on TCP `8787` during this status check.

### New Confirmed Findings

The USB probe sequencing was fixed in `scripts/connect-m5-usb.py`:

- Serial input is flushed once before the first probe.
- `diagnose` is sent first.
- The script reads until `diagnoseResult` or timeout before sending legacy probe
  commands.

After that fix, the firmware returned the decisive diagnostic frame:

- `firmwareVersion=0.2.1-icaros-minimal`
- `wifiStatus=3`
- `localIp=192.168.50.8`
- `wsHost=192.168.50.194`
- `wsPort=5184`
- `wsPath=/ws/device?pairing=redacted`
- `tcpProbeOk=true`
- `webSocketConfigured=true`
- `webSocketConnected=false`
- `lastWebSocketError=disconnected`

Interpretation:

- M5-to-Mac raw TCP reachability on port `5184` is now proven.
- WLAN, AP isolation, routing, and basic firewall reachability are no longer the
  primary suspects.
- The remaining failure is between TCP connect and accepted Host WebSocket frame:
  WebSocket upgrade, Host path/token handling, or runtime listener behavior.

### Re-run Against Host Port 5184

A fresh Host pairing run still failed:

- Pairing entered `wlan_test`.
- `usbOk=true`
- `wlanOk=false`
- `lastFrameAt=<none>`
- It timed out with:
  `Controller did not connect over WLAN/LAN WebSocket in time.`

During sampling, `lsof -nP -iTCP:5184` showed only the Host listener and no
established socket.

### Isolated Plain WebSocket Probe

An isolated plain WS probe server was started on:

```txt
ws://192.168.50.194:8787/ws/device
```

The M5 was temporarily configured to that URL. The isolated probe accepted a
connection from the M5 and received real frames:

- `register`
- `heartbeat`
- many `orientation` frames

Firmware status during this isolated probe showed:

- `webSocketConfigured=true`
- `webSocketConnected=true`

Interpretation:

- The minimal firmware's plain WebSocket implementation works.
- The M5 can connect from WLAN to the Mac and stream Host-compatible JSON frames.
- The failure is specific to the Host `/ws/device` endpoint on `5184`, not a
  general firmware, WLAN, IMU, or WebSocketsClient failure.

### Host Protocol Check

`bun run m5:pairing -- protocols --host-origin https://192.168.50.194:5183`
reported:

- Runtime WSS check passed.
- Device handshake check was skipped because `ICAROS_DEVICE_PAIRING_TOKEN` was
  not available in the CLI process environment.

Important implication:

- Token configuration is now a high-priority suspect.
- If the running Host uses a generated fallback token, but CLI/USB configure or
  operator tooling assumes a configured token, the M5 can hold a stale or
  mismatched `/ws/device?pairing=...` URL.
- This would explain why:
  - raw TCP succeeds,
  - isolated WS without token succeeds,
  - Host `/ws/device` never reaches `ready`.

### Updated Leading Diagnosis

Current most likely causes, ranked:

1. Host pairing token mismatch or missing stable `ICAROS_DEVICE_PAIRING_TOKEN`
   across Host/CLI/configure processes.
2. Host rejects the upgrade before `WebSocketsClient` reaches connected state,
   likely due invalid `pairing` query token.
3. Less likely: Host plain device server upgrade handling on `5184` differs from
   the isolated `ws` probe server in a way the Arduino client does not tolerate.

### Next Minimal Verification

1. Confirm the running Host process was started with a stable
   `ICAROS_DEVICE_PAIRING_TOKEN`.
2. Run `bun run m5:pairing -- protocols` from an environment containing the same
   stable token and verify the `/ws/device` handshake.
3. Reconfigure the M5 back to the Host-generated redacted URL for `5184`, reboot,
   and verify:
   - `diagnoseResult.tcpProbeOk=true`
   - `webSocketConnected=true`
   - Host snapshot `wlanOk=true`
   - Host snapshot `lastFrameAt` is set

Do not mark the objective complete yet. The actual success condition remains:
the Host must receive M5 frames over WLAN through `ws://192.168.50.194:5184/ws/device?pairing=...`.

## 2026-06-05 20:28 CEST - Root Cause Fixed And Hardware Pairing Verified

### New Root Cause

The decisive root cause was not WLAN, TCP reachability, or the M5 firmware.

The Host process had two module worlds:

- `server/index.ts` imported WebSocket gateway and device pairing modules
  directly from `src/lib/server/...`.
- SvelteKit production handler loaded from `build/handler.js` used bundled
  copies of the same server modules.

Without a configured `ICAROS_DEVICE_PAIRING_TOKEN`, both module worlds generated
their own random fallback pairing token. Result:

- The Web UI/API generated and USB-configured one token.
- The plain `/ws/device` gateway validated incoming M5 WebSocket upgrades
  against a different token.
- The M5 could reach TCP `5184`, but the Host rejected the upgrade as an invalid
  pairing token.
- Before the fix, WebSocket gateway debug writes also landed in a different
  in-memory pairing status instance than the Web/API snapshot.

### Fix Implemented

Minimal process-local sharing was added:

- `src/lib/server/device/pairing.ts`
  - stores the generated fallback pairing token on `globalThis` using a stable
    `Symbol.for(...)` key.
  - configured `ICAROS_DEVICE_PAIRING_TOKEN` still wins if present.
- `src/lib/server/device/usb-setup.ts`
  - stores pairing status, WLAN timeout, and debug-line id on `globalThis`.
  - the WebSocket gateway and SvelteKit Web/API now see the same snapshot state.
- `scripts/connect-m5-usb.py`
  - probe sequencing now sends `diagnose` first and reads until
    `diagnoseResult` before legacy probes.
  - this prevents `diagnoseResult.tcpProbeOk` from being flushed away.

### Verification Commands

Build and checks:

```sh
bun run lint
bunx biome check src/lib/server/device/pairing.ts src/lib/server/device/usb-setup.ts src/lib/server/ws/gateway.ts scripts/connect-m5-usb.py
bun run test
bun run build
bun run check
bun run firmware:m5:build
```

Observed:

- Biome full lint passed.
- Biome targeted check passed.
- Vitest passed: `5` files, `30` tests.
- SvelteKit production build passed.
- `svelte-check` passed with `0` errors and `0` warnings.
- Firmware PlatformIO build passed for `firmware/m5-controller`.

Fresh Host start:

```sh
PORT=5183 HOST=0.0.0.0 bun server/index.ts
```

Observed:

- `Icaros Host listening on https://0.0.0.0:5183`
- `M5 plain device WebSocket listening on ws://0.0.0.0:5184`

Port check:

```sh
lsof -nP -iTCP:5183 -sTCP:LISTEN
lsof -nP -iTCP:5184 -sTCP:LISTEN
```

Observed:

- `bun` PID `16279` listening on `*:5183`.
- `bun` PID `16279` listening on `*:5184`.

### Negative Control

After enabling debug, a fake-token local WebSocket check against `5184` produced
the expected Host-side rejection. Snapshot showed:

- `Plain device TCP connection from 192.168.50.8:62830.`
- `Rejected device WebSocket upgrade: invalid pairing token.`
- `Plain device TCP connection from 192.168.50.194:61847.`
- `Rejected device WebSocket upgrade: invalid pairing token.`

Interpretation:

- The Host now records gateway debug events in the same snapshot used by CLI/Web.
- A stale M5 token is visible as TCP plus invalid-token rejects.

### Successful Hardware Pairing

Command:

```sh
bun run m5:pairing -- pair --host-origin https://192.168.50.194:5183 --timeout-ms 125000
```

Observed:

- `pairing=started`
- `state=usb_connected`
- `state=firmware_check`
- `state=usb_test`
- `state=ready step=Bereit progress=100 ... wlanOk=true error=<none>`

Final snapshot:

```sh
bun run m5:pairing -- snapshot --host-origin https://192.168.50.194:5183
```

Observed:

- `pairedDeviceUrl=ws://192.168.50.194:5184/ws/device?pairing=redacted`
- `state=ready`
- `step=Bereit`
- `progress=100`
- `usbOk=true`
- `wlanOk=true`
- `error=<none>`
- `serverUrl=ws://192.168.50.194:5184/ws/device?pairing=redacted`
- `lastFrameAt=1780684123809`
- debug lines include paired `orientation` and `heartbeat` frames.

Socket evidence:

```sh
lsof -nP -iTCP:5184
```

Observed:

- `bun` PID `16279` listening on `*:5184`.
- established connection:
  `192.168.50.194:5184->192.168.50.8:55990`

### Updated Diagnosis

Confirmed:

- Firmware works.
- WLAN works.
- Raw TCP from M5 to Host works.
- Plain WebSocket from M5 works.
- Host accepts M5 frames over `ws://192.168.50.194:5184/ws/device?pairing=...`
  after token/status state is shared across module worlds.
- Host snapshot now reaches `wlanOk=true` and records `lastFrameAt`.

Best practice from this incident:

- Avoid random fallback secrets in more than one module/bundle world unless they
  are explicitly process-shared or externally configured.
- For production-like local hardware tests, prefer a stable
  `ICAROS_DEVICE_PAIRING_TOKEN` in the Host process environment.
- Keep CLI/Web UI on the same Host core/API, but ensure the WebSocket gateway
  and Web/API share runtime state when production builds bundle server modules.
