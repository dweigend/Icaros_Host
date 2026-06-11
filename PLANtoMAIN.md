# Purpose: current integration review notes for bringing Icaros Host changes
# toward main without losing the refactor decisions.

# PLAN to MAIN

This file is no longer a worker-thread implementation plan. It is a compact
integration checklist for reviewing the current issue-driven refactor before
any final merge to `main`.

## Current Target Architecture

- Icaros Host is the station router, gateway, and translator.
- The Host owns M5 device input, normalization, station state, launch selection,
  safe mode, and diagnostics.
- Experiences are external browser/WebXR clients.
- Experiences receive only normalized public control data from
  `/ws/control/:streamId`, with `/ws/control/main` as the default M1 stream.
- Runtime clients optionally register over `/ws/runtime` so the operator can
  choose one concrete Launch Client.
- Launch selection owns `/launch` routing only. It does not own public control
  delivery.
- `/launch` redirects only to the selected online runtime client's registered
  HTTPS URL and never falls back to HTTP or environment defaults.
- M5 raw frames stay behind `/ws/device` and never enter experience-facing APIs.
- `bun start` is the friendly Host bootstrap: ensure TLS, build, start the
  runtime server, and print/open useful URLs.
- `bun run start:strict` is for stable stations and must use fixed ports or fail
  clearly.

## Review Before Integration

- Review the current issue matrix for #1-#21 against code, docs, and tests.
- Confirm the branch remains net-negative versus `main`.
- Confirm `docs/host-lifecycle.md` remains a complete, self-contained guide and
  does not describe Launch Selection as Control Delivery.
- Confirm the rest of the docs stay concise and point to one source of truth per
  topic.
- Confirm Host console blocks live under `src/lib/blocks/host-console` and do
  not import route-local modules.
- Confirm `/` remains the single console page.
- Confirm no obsolete operator diagnostic registration remains in the runtime
  WebSocket contract.
- Confirm public client helpers are intentionally exported even if static
  analysis marks them unused inside this repository.

## Required Local Gates

- `bun run check`
- `bun run lint`
- `bun run test`
- `bun run build`
- Browser or SSR smoke for the console after visible UI changes.
- Startup scenarios for dynamic/strict/explicit ports before closing #13.

## Manual Stop Point

Do not merge to `main` until the user has reviewed the issue matrix, the
remaining risks, and the integration branch diff. The next safe step is a
reviewed merge from the current completion branch into `codex/integration-sweep`,
not a final merge to `main`.
