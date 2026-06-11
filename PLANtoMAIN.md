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

## Issue Evidence Matrix

Use this matrix for manual review before merging the completion branch into
`codex/integration-sweep`. It is evidence, not an automatic close action.

| Issues | Review focus | Primary evidence |
| --- | --- | --- |
| #1, #2 | Docs separate public control streams from optional launch registration. | `README.md`, `docs/control-streams.md`, `docs/client-api.md`, `docs/client-prompt.md`, `docs/host-lifecycle.md` |
| #3 | Public control stream names are server-owned and default to `main`. | `src/lib/server/control/control-stream-config.ts`, `src/lib/server/control/control-stream-config.test.ts` |
| #4 | `/ws/control/:streamId` accepts public normalized subscribers and rejects unknown streams. | `src/lib/server/ws/gateway.ts`, `src/lib/server/ws/control-stream-clients.ts`, `src/lib/server/ws/gateway-control-stream.test.ts` |
| #5 | Public `ControlOrientation` is only `pitch`, `roll`, `quality`, and required `safeMode`. | `src/lib/protocol/types.ts`, `src/lib/protocol/validators.ts`, `src/lib/server/control/normalizer.ts`, protocol and normalizer tests |
| #6 | Runtime registry manages launch presence, not control delivery. | `src/lib/server/ws/runtime-clients.ts`, `src/lib/server/ws/gateway.ts`, runtime/client tests |
| #7 | Launch selection vocabulary replaces active-client routing vocabulary. | `selectedLaunchClientId`, `selectedExperienceId`, `selectedForLaunch`, `setSelectedLaunchClient`, and no legacy active-client field hits |
| #8 | Launch routing no longer lives under an experiences namespace. | `src/lib/server/launch/launch-routing.ts`, `src/routes/launch/+server.ts` |
| #9 | Client helpers split public control stream subscription from launch registration. | `src/lib/client/control-stream-client.ts`, `src/lib/client/launch-registration-client.ts`, compatibility facade in `src/lib/client/experience-client.ts` |
| #10, #20 | Console visibly separates Launch Selection, Public Control Stream, and Launch Client Registry. | `src/lib/blocks/host-console/components/*`, `src/routes/+page.svelte`, SSR/browser smoke |
| #11 | Runtime socket no longer carries operator diagnostic registration. | `src/routes/runtime-debug.ts`, `src/routes/console-control-stream-state.svelte.ts`, no legacy operator diagnostic registration hits |
| #12 | `bun start` is Host bootstrap only. | `scripts/start-host.ts`, old clean-start shell wrapper removed, `server/index.ts` stays runtime entrypoint |
| #13 | Startup has dynamic and strict port modes. | `src/lib/server/startup/host-config.ts`, startup tests, manual port smoke |
| #14 | Setup docs explain simplified startup and Host without required controller. | `README.md`, `docs/quest-https-launch-routing.md`, `docs/host-lifecycle.md` |
| #15 | Console tokens align with terminal UI rules. | `src/app.css`, primitive/block classes |
| #16 | Console panels are block families under `src/lib/blocks`. | `src/lib/blocks/host-console`, thin `src/routes/+page.svelte` |
| #17, #21 | Bits UI primitive set stays minimal and CSS ownership is explicit. | `src/lib/components/select`, existing primitive families, `src/app.css` |
| #18 | Reusable route-local console CSS and direct meter widths are removed. | `src/app.css`, block components, `style:--progress-value` custom-property pattern |
| #19 | Browser state is split by UI responsibility. | `src/routes/console-control-stream-state.svelte.ts`, `src/routes/console-launch-registry-state.svelte.ts`, thin composer in `src/routes/console-state.svelte.ts` |

## Required Local Gates

- `bun run check`
- `bun run lint`
- `bun run test`
- `bun run build`
- Browser or SSR smoke for the console after visible UI changes.
- Startup scenarios for dynamic/strict/explicit ports before closing #13.

## Current Review Snapshot

Review snapshot from the current completion branch `codex/ui-completion-finish`,
compared with current `origin/main`.

- Worktree: clean.
- Diff versus `origin/main`: 92 files changed, 3166 insertions, 3818 deletions.
- Net line count versus `origin/main`: 652 fewer lines.
- `bun run check`: passing.
- `bun run lint`: passing.
- `bun run test`: passing, 17 files and 81 tests.
- `bun run build`: passing.
- Fallow audit: passing, with zero dead-code issues, zero complexity findings,
  and zero duplication clone groups in the current audit.
- Targeted Vitest gateway check: passing for
  `src/lib/server/ws/control-stream-clients.test.ts` and
  `src/lib/server/ws/gateway-control-stream.test.ts`.
- Do not use raw `bun test` for the WebSocket gateway files; this repository's
  authoritative test command is Vitest through `bun run test`.

## Current Remote Main Note

`origin/main` currently includes one commit after this branch's original base:
`9dd45e4`, which changes only `firmware/m5-controller/README.md`. A
non-destructive `git merge-tree` check showed no merge conflict with
`codex/ui-completion-finish`; the later integration should simply carry that
firmware README title change forward.

## Manual Stop Point

Do not merge to `main` until the user has reviewed the issue matrix, the
remaining risks, and the integration branch diff. The next safe step is a
reviewed merge from the current completion branch into `codex/integration-sweep`,
not a final merge to `main`.
