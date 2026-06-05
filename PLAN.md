# Icaros Host Plan

Purpose: this document captures the current M1 implementation plan so a fresh
coding agent can start work without re-deciding product and architecture
boundaries.

## M1 Goal

Create the first working Icaros Host for one station. The host is a router,
gateway, and translator. It serves a fixed Quest route, lists installed
experience builds, lets an operator choose an experience, and forwards normalized
M5 control data to the active experience.

## Decisions Locked For M1

- Stack: Bun, Vite, SvelteKit, Biome, Bits UI, and the local UI system as design
  reference.
- Station model: exactly one active station, `station-a`.
- Quest URL: fixed route at `https://station-a.local/vr`.
- VR routing model: `/vr` redirects to the current active experience or shows a
  waiting/recovery page.
- Active experience state: one server-side `activeExperienceId`.
- Experience delivery: host-served static builds from local `dist` folders.
- Experience source repos: manually installed and built on the server machine.
- M5 input: keep existing M5 WebSocket protocol compatible on `/ws/device`.
- Experience API: normalized `pitch` and `roll` in `-1..1`.
- Security model: no user auth, pairing, RBAC, or app-level encryption in M1.
- HTTPS/WSS: required for Quest-facing routes and sockets.
- Internal services: may run plain HTTP/WS behind the host gateway.

## Message Contract

All new non-M5 messages use one shared envelope:

```ts
type Message<TPayload> = {
  protocol: "neural-flight.v1";
  type: string;
  stationId: string;
  source: {
    role: "host" | "operator" | "quest" | "experience" | "m5";
    id: string;
  };
  timestamp: number;
  payload: TPayload;
};
```

Initial message types:

- `client.register`
- `station.state`
- `operator.setActiveExperience`
- `device.heartbeat`
- `control.orientation`
- `experience.ready`
- `station.reset`

## Experience Manifest

Each finished build contains `experience.manifest.json`:

```json
{
  "id": "echo-flight",
  "title": "Echo Flight",
  "entry": "/experiences/echo-flight/",
  "requiredDevices": ["quest", "m5"],
  "protocol": "neural-flight.v1",
  "mode": "prototype"
}
```

The host must validate manifests before adding them to the operator list.
Invalid manifests should be reported clearly and not loaded.

The station state payload is intentionally small:

```ts
{
  activeExperienceId: string | null;
}
```

## Runtime Flow

1. Host starts and scans `<ICAROS_EXPERIENCES_DIR>`.
2. Host serves `/vr` as the fixed Quest route.
3. Operator opens `/operator`.
4. M5 connects to `ws://<host-ip>:8787/ws/device`.
5. Quest opens `/vr`.
6. If no experience is active, `/vr` shows a waiting/recovery page.
7. Operator selects an experience and sets `activeExperienceId`.
8. Quest reloads or revisits `/vr`.
9. `/vr` redirects to `/experiences/<experience-id>/`.
10. Experience client sends `experience.ready`.
11. Host forwards `control.orientation` to the active experience.
12. If `activeExperienceId` changes, the template client receives
    `station.state` and navigates back to `/vr`.

## Extension Points Prepared In M1

- Admin UI: M1 includes a minimal operator page, not a full dashboard.
- Template client library: M1 should expose a small reusable client module for
  student experiences.
- mDNS and LAN scan: prepare a `DiscoveryProvider` boundary, but use local
  filesystem discovery first.
- Multi-session: all state and messages include `stationId`, but only
  `station-a` runs in M1.
- Auth/RBAC: `source.role` exists for structure, not enforcement.
- Neural/ML: prepare a pass-through `ControlPolicy`, but do not implement ML.

## Suggested Implementation Phases

1. Scaffold SvelteKit, tooling, and project structure.
2. Implement protocol types and validators.
3. Implement station state and M5-compatible device input.
4. Implement experience manifest scanning and static serving.
5. Implement runtime WebSocket routing.
6. Implement `/vr` redirect/waiting route and `/operator` minimal UI.
7. Implement template client library.
8. Add tests and build checks.

## Acceptance Criteria

- A simulated M5 can drive normalized control data.
- The operator can see installed experiences.
- The operator can set the active experience.
- `/vr` redirects to the active experience.
- `/vr` shows waiting/recovery state when no experience is active.
- The active experience receives `control.orientation`.
- A running old experience returns to `/vr` when `activeExperienceId` changes.
- M5 stale or disconnect state produces safe neutral controls.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass once
  tooling is implemented.
