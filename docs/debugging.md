# Debugging

Purpose: this document defines how humans and LLM agents inspect Icaros Host
pairing diagnostics without relying on unbounded runtime logs.

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
