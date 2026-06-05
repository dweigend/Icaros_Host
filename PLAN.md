# Icaros Host Plan

Purpose: this document captures the current MVP implementation plan so a fresh
agent can continue without reintroducing removed routes or dashboard complexity.

## Current Goal

Build one local station host with one integrated terminal-style console page.
The host is still a router, gateway, and translator, but the UI is deliberately
small:

- `/` is the only SvelteKit page.
- No `/operator` UI route.
- No `/vr` UI route.
- No `/api/*` UI helper endpoints.
- No `/experiences/*` static serving route in this slice.

## Locked MVP Decisions

- Stack: Bun, SvelteKit, TypeScript strict, Biome, Bits UI.
- UI: one page, terminal look, dense and technical.
- Station model: one station, `station-a`.
- Active state: one server-side `activeExperienceId`.
- Experience discovery: local manifest scan from finished `dist` folders.
- Active selection: SvelteKit form action on `/`.
- M5 input: raw frames connect to `/ws/device`.
- Runtime clients: connect to `/ws/runtime`.
- Experience API: normalized `pitch` and `roll` in `-1..1`.

## Message Contract

All non-M5 runtime messages use one shared envelope:

```ts
type Message<TPayload> = {
  protocol: "neural-flight.v1";
  type: string;
  stationId: "station-a";
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
- `control.orientation`
- `experience.ready`

## Manifest Discovery

The host validates local manifests before listing them in the console. Invalid
manifests are reported as scan errors and cannot become active.

```json
{
  "id": "echo-flight",
  "title": "Echo Flight",
  "entry": "echo-flight",
  "requiredDevices": ["quest", "m5"],
  "protocol": "neural-flight.v1",
  "mode": "prototype"
}
```

`entry` remains metadata for now. The current MVP does not serve experience
assets or redirect the Quest.

## Runtime Flow

1. Host starts and scans `<ICAROS_EXPERIENCES_DIR>`.
2. Operator opens `/`.
3. Console lists valid manifests and scan errors.
4. Operator sets `activeExperienceId`.
5. M5 connects to `/ws/device`.
6. Runtime clients connect to `/ws/runtime`.
7. Host forwards `station.state` to runtime clients.
8. Host forwards `control.orientation` only to the active registered experience.
9. Stale or disconnected M5 state produces neutral safe-mode controls.

## Acceptance Criteria

- One page shows station status and installed manifests.
- Operator can set and clear `activeExperienceId`.
- Invalid or missing manifests are visible as scan errors.
- A simulated M5 can drive normalized control data.
- Active registered experience receives `control.orientation`.
- Stale/disconnected M5 state produces safe neutral controls.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
