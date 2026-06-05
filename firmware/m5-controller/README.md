# Minimal M5 Controller Firmware

Purpose: this folder contains the Host-local M5StickC Plus2 firmware used to
prove plain WiFi WebSocket connectivity to Icaros Host. It is deliberately small:
USB config, WiFi, one `ws://` client, diagnostics, heartbeat, and IMU orientation.

## Boundary

- This firmware lives in the Host repo.
- `/Users/weigend/Documents/GitHub/M5_WebSocet_Adapter` is only a readonly
  reference and is not modified by this project.
- Firmware upload is manual/explicit. `scripts/connect-m5-usb.py` must not flash
  this project automatically.
- TLS/WSS is out of scope for this MVP. The firmware accepts only `ws://` URLs.

## Build

```sh
bun run firmware:m5:build
```

This uses `uvx` to run PlatformIO without requiring a globally installed `pio`.

## Upload

Upload is opt-in and should be run only when you intend to replace the attached
controller firmware:

```sh
pio run -d firmware/m5-controller -t upload --upload-port /dev/cu.usbserial-...
```

Then monitor serial output:

```sh
pio device monitor -d firmware/m5-controller --baud 115200 --port /dev/cu.usbserial-...
```

## Display Diagnostics

The built-in display is a local diagnostics surface only. It renders a compact
status view from existing firmware state and does not own WiFi, WebSocket,
pairing, IMU sampling, or telemetry behavior.

The screen shows:

- a simple pitch/roll level indicator
- WiFi and WebSocket connection status
- the controller's local IP address
- the configured server URL

The display renderer lives in `src/controller_display.cpp` and is connected from
`src/main.cpp` with a small periodic snapshot update. It uses an offscreen
M5GFX canvas before pushing frames to the LCD to reduce flicker. Pairing tokens
in server URLs are redacted before rendering.

## Serial Protocol

All USB messages are newline-delimited JSON objects at `115200` baud.

Configure:

```json
{"type":"configure","ssid":"<wifi-ssid>","password":"<wifi-password>","serverUrl":"ws://192.168.50.194:5184/ws/device?pairing=<token>","deviceId":"icaros-station-a-m5"}
```

Diagnose:

```json
{"type":"diagnose"}
```

Reboot:

```json
{"type":"reboot"}
```

The firmware responds with `configureResult`, `diagnoseResult`, `register`,
`heartbeat`, and `orientation` frames. Pairing tokens are redacted in diagnostic
URLs.
