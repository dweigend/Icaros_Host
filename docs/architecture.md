# Icaros Host Architecture

Purpose: this document shows the current one-page MVP architecture.

## System Diagram

```mermaid
flowchart TD
  subgraph Station["Icaros Station: station-a"]
    Console["Single Console Page\n/"]
    Host["Host Runtime\nSvelteKit + Bun"]
    ActiveState["activeExperienceId"]
    M5Bridge["M5 WebSocket\n/ws/device"]
    RuntimeWs["Runtime WebSocket\n/ws/runtime"]
    ExperienceStore["Experience Manifests\n<experiences-dir>/*/dist"]
  end

  subgraph DeviceLayer["Physical / Runtime Clients"]
    M5["M5 Controller\nraw frames"]
    Client["Runtime Client\nexperience template"]
  end

  M5 -->|"raw protocol"| M5Bridge
  M5Bridge -->|"normalize pitch/roll"| Host
  Host -->|"control.orientation"| RuntimeWs

  Console -->|"scan manifests"| ExperienceStore
  ExperienceStore -->|"valid manifests + errors"| Console
  Console -->|"set / clear active"| ActiveState
  ActiveState -->|"station.state"| RuntimeWs
  RuntimeWs --> Client
```

## Data Flow

1. The console page `/` scans finished experience manifests.
2. The operator selects one valid experience id.
3. The host stores that id as `activeExperienceId`.
4. The M5 connects over `/ws/device` and sends raw frames.
5. The host validates and normalizes raw frames.
6. Runtime clients connect over `/ws/runtime`.
7. Runtime clients receive station state.
8. Only the active registered experience receives normalized controls.

## Boundary Rules

- The UI has no subpages in this MVP.
- The host owns routing state, device state, and control translation.
- The M5 endpoint owns raw-frame compatibility.
- Experiences receive normalized controls only.
- Static experience serving is not part of the current one-page UI slice.
