# Icaros Host

Purpose: this README explains the current Icaros Host MVP after the UI was
collapsed into one technical console page.

## Current MVP Shape

Icaros Host is the station router, gateway, and translator for one local
station. The host owns station state, device input, runtime sockets, and
experience discovery. The UI is intentionally one page:

```txt
/
  single operator console
  station status
  installed experience manifests
  activeExperienceId action
```

There are no UI subpages in the current MVP. Extra SvelteKit routes that were
previously planned for `/operator`, `/vr`, `/api/*`, and `/experiences/*` were
removed to keep the codebase small and readable.

## Runtime Boundaries

- The M5 sends raw frames only to the host over `/ws/device`.
- The host normalizes raw M5 data into `control.orientation`.
- Runtime clients connect over `/ws/runtime`.
- Experiences receive normalized controls only.
- Experiences do not connect directly to the M5.
- Raw M5 data does not enter Three.js or student experience code.

## Station Model

M1 still targets one physical station:

- station id: `station-a`
- one M5 controller
- one active experience id
- many installed experience manifests
- one operator-facing host console

The host stores:

```ts
{
  activeExperienceId: string | null;
}
```

The single console page reads that state and updates it through a SvelteKit form
action. No separate operator route or JSON API is needed for the MVP UI.

## Experience Discovery

The host scans finished build folders for manifests. In this MVP, discovery is
used to populate the console and validate `activeExperienceId`; static serving
of experience builds is intentionally not part of the current UI slice.

Expected layout:

```txt
<ICAROS_EXPERIENCES_DIR>/
  echo-flight/
    dist/
      experience.manifest.json
  bat-sense/
    dist/
      experience.manifest.json
```

Each manifest describes the experience:

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

`entry` is metadata in this MVP. The console does not serve or redirect to that
entry.

## Control API

Experiences receive normalized control payloads:

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

`pitch` and `roll` are normalized to `-1..1`. Stale or disconnected M5 state
produces neutral safe-mode controls.

## Related Docs

- [Architecture](docs/architecture.md)
- [Experience Client API](docs/client-api.md)
- [Implementation Plan](PLAN.md)
- [Coding Standards](CODINGSTANDARDS.md)
- [Agent Rules](AGENTS.md)
