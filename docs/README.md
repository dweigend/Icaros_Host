# Icaros Host Docs

Purpose: this directory is the documentation source of truth for the current
Icaros Host MVP. It keeps architecture, runtime contracts, and operator setup
close to the code while the top-level README stays short.

## Start Here

- [Architecture](architecture.md): station boundaries, runtime ownership, and
  system data flow.
- [Implementation Plan](PLAN.md): current MVP decisions, runtime flow, and
  acceptance criteria.
- [Quest HTTPS Launch Routing](quest-https-launch-routing.md): LAN URLs, HTTPS
  certificate setup, `/launch` behavior, and troubleshooting for the headset.
- [Experience Client API](client-api.md): browser/WebXR client contract for
  experiences that consume normalized controls.
- [Debugging](debugging.md): bounded pairing debug snapshot for humans and LLM
  agents.
- [M5 Pairing Solution](m5-pairing-solution.md): confirmed root cause, fix,
  verification matrix, and best practices for the USB/WLAN/WebSocket pairing.
- [Station Orchestration Roadmap](station-orchestration-roadmap.md): optional
  post-MVP expansion path for multiple clients, devices, outputs, and
  externally offered experiences.

## Current MVP Rules

- The host is the station router, gateway, and translator.
- The host is not the WebXR experience.
- `/` is the single operator console page.
- `/launch` is a redirect endpoint, not a UI page and not a static asset server.
- `/launch` must never default, fall back, or redirect to HTTP experience URLs.
  Missing or HTTP experience configuration must fail with a clear error.
- Experience clients run separately, currently commonly on port `5174`.
- Runtime clients register over `/ws/runtime`.
- M5 devices send raw frames only to `/ws/device`.
- HTTPS browser pages use WSS for runtime sockets.

## Common Local URLs

| Surface | Local development | Quest/LAN development |
| --- | --- | --- |
| Host console | HTTPS only | `https://<host-lan-ip-or-name>:5183/` |
| Quest launch endpoint | no HTTP launch path; use HTTPS | `https://<host-lan-ip-or-name>:5183/launch` |
| Experience client | HTTPS only | `https://<client-lan-ip-or-name>:5174/` |
| Runtime WebSocket | WSS only | `wss://<host-lan-ip-or-name>:5183/ws/runtime` |
| M5 WebSocket | plain device boundary only | `ws://<host-lan-ip-or-name>:5184/ws/device` |

`/launch` does not redirect to HTTP and should not be advertised as an HTTP
URL. For the Meta Quest and WebXR, use HTTPS on the LAN address and make the
headset trust the development certificate authority.
The `/launch` endpoint is always on the Host origin. Do not use
`<client-lan-ip-or-name>:5174/launch`; port `5174` is the experience client
origin only. The Host and Client own separate certificates.
