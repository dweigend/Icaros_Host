# Station Orchestration Roadmap

Purpose: this document describes a possible post-MVP expansion path for Icaros
Host. It is intentionally high level and does not change the current M1 scope:
one station, one operator console page, one active experience, and normalized
controls routed through the host.

## Summary

The current host can grow from a single-experience router into a local station
orchestrator. The core principle should stay the same:

```text
All participants connect to the host.
The host owns presence, capabilities, assignment, and routing.
Participants never discover or control each other directly.
```

That model supports multiple runtime clients, multiple input devices, multiple
output devices, and multiple externally served experiences without turning the
host into an asset server or a peer-to-peer network.

## Research Notes

- Use DHCP or explicit provisioning for IP addresses. A startup script should
  not try to assign "free" IPs during normal runtime; that is the router's or a
  provisioning tool's job.
- Use mDNS/DNS-SD for local host discovery when available. The host can publish
  a service such as `_icaros-host._tcp.local`; devices can resolve it to a host
  and port. Keep TXT data small and non-sensitive.
- Keep a manual fallback: stored host URL, QR code, or USB-provisioned host
  URL. Discovery can fail on segmented Wi-Fi, guest networks, VPNs, or locked
  down devices.
- Use WebSocket only as the transport. Application-level `*.hello`,
  `*.registered`, `*.rejected`, and `*.heartbeat` messages should define
  identity, capabilities, and liveness.
- Keep message streams bounded. Browser WebSocket has no built-in backpressure,
  so high-frequency telemetry should be normalized, rate-limited, or coalesced
  by the host.
- Treat service discovery as public metadata. mDNS/DNS-SD can expose device and
  service names on the local link, so publish generic names and move identity,
  pairing, and authorization into the host handshake.

References:

- [RFC 2131: Dynamic Host Configuration Protocol](https://datatracker.ietf.org/doc/html/rfc2131)
- [RFC 6762: Multicast DNS](https://www.rfc-editor.org/rfc/rfc6762)
- [RFC 6763: DNS-Based Service Discovery](https://datatracker.ietf.org/doc/html/rfc6763)
- [RFC 8882: DNS-SD Privacy and Security Requirements](https://www.rfc-editor.org/rfc/rfc8882.html)
- [RFC 6455: The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Apple Bonjour overview](https://developer.apple.com/bonjour/)

## Target Model

Participants register by role and capabilities:

```text
Input devices       M5 controller, trackers, buttons
Runtime clients     Quest browser, desktop browser, operator debug tap
Output devices      DMX, lights, motion platform, audio bridge
Experience offers   Externally served WebXR/browser experiences
Operator console    Human-facing assignment and status surface
```

The host maintains sessions instead of one global active experience:

```ts
type StationSession = Readonly<{
	sessionId: string;
	experienceId: string;
	inputDeviceIds: readonly string[];
	runtimeClientIds: readonly string[];
	outputDeviceIds: readonly string[];
	status: 'idle' | 'running' | 'stale' | 'error';
}>;
```

Routing then becomes explicit:

```text
M5 Controller 1 -> Session "mountain-flight" -> Quest Client A
                                      `-------> DMX Main
```

## Startup And Discovery Flow

A participant startup script should do only enough work to find and join the
host. IP ownership stays outside the application runtime.

```text
1. Load stable local identity
   Browser localStorage, device flash, or config file.

2. Check network readiness
   Confirm a local IP and gateway exist. Do not claim a free IP.

3. Find host
   Prefer stored/provisioned URL.
   Then try mDNS/DNS-SD for _icaros-host._tcp.local.
   Then allow QR-code/manual URL.
   Optional last resort: narrow /health scan in the local subnet.

4. Bootstrap over HTTP(S)
   GET /health or future /api/bootstrap.
   Validate station id, protocol version, and required URLs.

5. Open role-specific WebSocket
   /ws/runtime for browser clients.
   /ws/device for input devices.
   /ws/output for future output devices.

6. Send role-specific hello
   client.hello, device.hello, output.hello, or experience.offer.

7. Wait for registered/rejected
   Only registered participants become routable.

8. Start heartbeat
   Host updates presence and marks stale participants neutral.
```

Example device registration:

```json
{
  "type": "device.hello",
  "payload": {
    "deviceId": "m5-controller-1",
    "kind": "m5-controller",
    "capabilities": ["orientation"],
    "firmwareVersion": "0.1.0"
  }
}
```

Example output registration:

```json
{
  "type": "output.hello",
  "payload": {
    "outputId": "dmx-main",
    "kind": "dmx",
    "capabilities": ["lights.rgb", "lights.intensity"]
  }
}
```

Example experience offer:

```json
{
  "type": "experience.offer",
  "payload": {
    "experienceId": "mountain-flight",
    "title": "Mountain Flight",
    "url": "https://192.168.50.194:5174/",
    "requiredInputs": ["orientation"],
    "optionalOutputs": ["lights.rgb"]
  }
}
```

## Phase 1: Presence And Concrete Runtime Clients

Goal: make connected browser/Quest instances visible and selectable without
changing the device protocol or adding multi-session behavior.

- Add `client.hello`, `client.heartbeat`, `client.registered`,
  `client.rejected`, and `runtime.clients`.
- Track concrete runtime client instances with `clientId`, `experienceId`,
  `title`, `url`, `connectedAt`, `lastSeenAt`, and `status`.
- Keep `activeExperienceId` for compatibility, but add `activeClientId` for
  precise routing.
- Show available runtime clients in the existing single console page.
- Keep the runtime handshake singular: public clients use `client.hello`;
  operator diagnostics use `operator.diagnostic.register`.

Success criteria:

- Two open `mountain-flight` browser instances appear separately.
- The operator can select one active client.
- Only the selected client receives controls once `activeClientId` routing is
  enabled.

## Phase 2: Device Registry And Session Assignment

Goal: make input devices first-class host participants and route them through a
single station session.

- Add a separate device registry for M5 and future input devices.
- Preserve the existing `/ws/device` M5 frame shape and pairing token boundary.
- Add optional `device.hello` and `device.heartbeat`; if firmware cannot change
  immediately, treat the first valid paired frame as an implicit registration.
- Introduce a minimal `StationSession` model with one active session.
- Let the operator assign one input device to one runtime client/experience
  pair.
- Keep stale or disconnected input devices mapped to neutral safe-mode controls.

Success criteria:

- The console shows connected input devices and runtime clients separately.
- The operator can assign an M5 controller to the active session.
- The host can explain why controls are live, stale, neutral, or rejected.

## Phase 3: Multi-Endpoint Orchestration

Goal: route multiple inputs, clients, output devices, and available experiences
through explicit sessions.

- Add `output.hello` and an output device registry for DMX, lights, motion, or
  other command sinks.
- Add `experience.offer` or signed/static manifests so externally running
  experiences can advertise `experienceId`, title, URL, required inputs, and
  optional outputs.
- Allow multiple sessions when the physical station model is ready for it.
- Route normalized control streams and host-generated output commands by
  session, not by global station state.
- Add operator views for Devices, Runtime Clients, Output Devices, Experiences,
  and Sessions while keeping `/` as the single console page unless the UI scope
  is explicitly reopened.

Success criteria:

- The host can show which experiences are available, which clients are
  connected, which devices are online, and which routes are active.
- A controller can be assigned to a specific VR experience instance.
- An output device can subscribe to the same session without seeing raw M5
  frames.
- Multiple routes can coexist without clients or devices discovering each other.

## Non-Goals For This Roadmap

- Do not turn the host into a static experience asset server.
- Do not let experiences connect directly to M5 or output devices.
- Do not stream websites over WebSocket.
- Do not implement DHCP inside the host for normal runtime.
- Do not build a fully general graph router before one-session assignment is
  proven useful.
