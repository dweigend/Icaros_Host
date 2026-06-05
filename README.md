# Icaros Host

Purpose: this README explains the Icaros Host system, its boundaries, and the
first implementation milestone. It is written for operators, students, and
coding agents who need to understand the architecture before changing code.

## Core Rule

The server is not the experience.

The Icaros Host is the router, gateway, and translator for one physical station.
It knows devices, routing, session state, and installed experiences. The
experience only receives normalized control data and renders its own WebXR
world.

```txt
M5 Controller
  -> Host Server
  -> normalized control data
  -> active experience on the Quest

Operator UI
  -> Host Server
  -> selects experience
  -> /vr resolves to the selected experience
```

Do not connect experiences directly to the M5. Do not evaluate M5 raw data in
Three.js levels. Do not send websites over WebSocket.

## M1 Architecture

Icaros Host starts as a single-station system:

- Station id: `station-a`
- One Meta Quest headset
- One M5 controller
- One active experience at a time
- Many installed experience builds
- One operator UI

The Quest always opens the same default URL:

```txt
https://station-a.local/vr
```

That route is the central routing point. It is not a level. It reads the current
station state and either shows a small waiting/recovery page or redirects to the
active host-served experience URL:

```txt
https://station-a.local/experiences/<experience-id>/
```

The operator never changes the headset URL. The operator only changes the
server-side `activeExperienceId`; `/vr` turns that state into the right page.

## Four Core Parts

| Part | Responsibility |
| --- | --- |
| Host Router | Tracks devices, installed experiences, station state, and routing. |
| Operator UI | Lets the operator inspect status and set the active experience. |
| Quest Route | Fixed `/vr` route that redirects to the active experience or waits. |
| Experience Client | Renders Three.js/WebXR and reacts to normalized controls. |

## Transport Boundaries

Meta Quest WebXR requires a secure origin for production use. The headset-facing
surface therefore uses HTTPS and WSS.

The M5 firmware remains compatible with the existing adapter protocol and uses
plain WebSocket:

```txt
ws://<host-ip>:8787/ws/device
```

Internal server services may use plain HTTP and WS behind the host gateway. The
network itself is assumed to be externally secured; M1 does not implement user
auth, pairing, RBAC, or app-level encryption.

## Experience Installation

Student teams build their experiences in their own repositories and push them to
GitHub. For M1, an operator manually installs and builds those repositories on
the server machine. The host scans finished build folders, not source projects.

Expected layout:

```txt
<ICAROS_EXPERIENCES_DIR>/
  echo-flight/
    dist/
      index.html
      experience.manifest.json
  bat-sense/
    dist/
      index.html
      experience.manifest.json
```

Each manifest describes the experience. The host builds the operator list from
these manifests and serves each `dist` folder under `/experiences/<id>/`.

## VR Routing

M1 uses the simplest routing model:

```txt
/operator sets activeExperienceId
/vr reads activeExperienceId
/vr redirects to /experiences/<activeExperienceId>/
```

If there is no active experience, `/vr` shows a waiting page. If the active
experience changes while an old experience is running, the template client
library receives `station.state` and navigates back to `/vr`. The server then
redirects the headset to the new active experience.

## Control API

The M5 may send raw IMU and orientation data. Only the host interprets those raw
frames. Experiences receive a small normalized control payload:

```ts
{
  pitch: number;
  roll: number;
  quality: number;
  source: "m5";
  safeMode: boolean;
  timestamp: number;
}
```

`pitch` and `roll` are normalized to `-1..1`. Firmware details, reconnect logic,
calibration, dead zones, smoothing, and stale-device handling stay on the host.

The runtime WebSocket sends only station state and control data to experiences.
It does not send complete pages or route payloads.

The station state is the central routing contract:

```ts
{
  activeExperienceId: string | null;
}
```

## Related Docs

- [Architecture Diagram](docs/architecture.md)
- [Implementation Plan](PLAN.md)
- [Coding Standards](CODINGSTANDARDS.md)
- [Agent Rules](AGENTS.md)
