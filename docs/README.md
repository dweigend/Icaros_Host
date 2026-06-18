# Icaros Host Docs

Purpose: this directory is the documentation source of truth for the current
Icaros Host MVP. It keeps architecture, runtime contracts, and operator setup
close to the code while the top-level README stays short.

## Start Here

- [Architecture](architecture.md): station boundaries, runtime ownership, and
  system data flow.
- [Host Lifecycle](host-lifecycle.md): a guided journey through startup,
  controller setup, runtime clients, launch routing, and neutral safety behavior.
- [Implementation Plan](PLAN.md): current MVP decisions, runtime flow, and
  acceptance criteria.
- [Quest HTTPS Launch Routing](quest-https-launch-routing.md): LAN URLs, HTTPS
  certificate setup, `/launch` behavior, and troubleshooting for the headset.
- [Experience Client API](client-api.md): browser/WebXR client contract for
  experiences that consume normalized controls.
- [Control Streams](control-streams.md): public normalized control stream names
  and the M1 default stream contract.
- [Debugging](debugging.md): bounded pairing debug snapshot for humans and LLM
  agents.
- [M5 Pairing Solution](m5-pairing-solution.md): confirmed root cause, fix,
  verification matrix, and best practices for the USB/WLAN/WebSocket pairing.

## Document Ownership

Use the narrowest canonical source for each question:

| Document | Owns | Does not own |
| --- | --- | --- |
| [client-api.md](client-api.md) | Public experience-client wire contract and browser helper behavior. | Quest certificate setup or M5 pairing. |
| [quest-https-launch-routing.md](quest-https-launch-routing.md) | LAN origins, HTTPS/WSS setup, `/launch` operations, and headset troubleshooting. | Runtime payload shape details. |
| [architecture.md](architecture.md) | Boundaries, ownership, and data flow. | Step-by-step operation. |
| [host-lifecycle.md](host-lifecycle.md) | Guided codebase tour for humans and agents. | Canonical protocol or deployment decisions. |
| [PLAN.md](PLAN.md) | Current MVP decisions, acceptance criteria, and remaining implementation checks. | Operational runbook details. |
| [debugging.md](debugging.md) | Current M5 diagnostics workflow for console, CLI, and bounded debug snapshots. | Historical incident narrative. |
| [m5-pairing-solution.md](m5-pairing-solution.md) | Historical M5 pairing fix report and reproducible verification commands. | Current live station state. |

When docs overlap, keep the detailed behavior in the owning document and link
to it from the other pages.

## Current MVP Rules

- The host is the station router, gateway, and translator.
- The host is not the WebXR experience.
- `/` is the single operator console page.
- `/launch` is a redirect endpoint, not a UI page and not a static asset server.
- `/launch` redirects only to the selected runtime client's registered HTTPS
  URL.
- Experience clients consume normalized controls from `/ws/control/main`.
- Experience clients register over `/ws/runtime` only when they should appear in
  the launch selection.
- M5 devices send raw frames only to `/ws/device`.
- HTTPS browser pages use WSS for control and runtime sockets.
- `/api/m5-pairing` is a diagnostics endpoint for CLI and automation, not a
  public UI helper API or experience API.

## Canonical Setup References

- Quest, HTTPS, WSS, certificate, and `/launch` details:
  [Quest HTTPS Launch Routing](quest-https-launch-routing.md)
- Runtime handshake, envelope, and client checklist:
  [Experience Client API](client-api.md)
- Public normalized control stream names:
  [Control Streams](control-streams.md)
- M5 diagnosis and bounded debug snapshots:
  [Debugging](debugging.md)
