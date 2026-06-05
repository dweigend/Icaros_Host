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

## Current MVP Rules

- The host is the station router, gateway, and translator.
- The host is not the WebXR experience.
- `/` is the single operator console page.
- `/launch` is a redirect endpoint, not a UI page and not a static asset server.
- Experience clients run separately, currently commonly on port `5174`.
- Runtime clients register over `/ws/runtime`.
- M5 devices send raw frames only to `/ws/device`.
- HTTPS browser pages use WSS for runtime sockets.

## Common Local URLs

| Surface | Local development | Quest/LAN development |
| --- | --- | --- |
| Host console | `http://localhost:5183/` | `https://<mac-lan-ip>:5183/` |
| Quest launch endpoint | `http://localhost:5183/launch` | `https://<mac-lan-ip>:5183/launch` |
| Experience client | `http://localhost:5174/` | `https://<mac-lan-ip>:5174/` |
| Runtime WebSocket | `ws://localhost:5183/ws/runtime` | `wss://<mac-lan-ip>:5183/ws/runtime` |
| M5 WebSocket | `ws://<mac-lan-ip>:5183/ws/device` | `wss://<mac-lan-ip>:5183/ws/device` when Host runs HTTPS |

Use plain HTTP only for desktop development. For the Meta Quest and WebXR,
prefer HTTPS on the LAN address and make the headset trust the development
certificate authority.
