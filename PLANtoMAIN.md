# Purpose: push-readiness plan for Icaros Host.
#
# This file coordinates the cleanup from the current Codex branch back to main.
# It records architecture decisions, thread ownership, and verification gates so
# multiple agents can work without creating competing implementations.

# PLAN to MAIN

## Goal

Prepare Icaros Host for the first GitHub push as a clean, teachable HTW student
project and as the Host successor path for the NeuralFlight template.

The repository must present one clear architecture:

- Icaros Host is the station router, gateway, and translator.
- Experiences are external browser/WebXR clients.
- M5 raw frames enter only through the Host device boundary.
- Experiences receive only validated, normalized, smoothed controls.
- Runtime clients register through one robust handshake.
- The operator selects one concrete active runtime client.
- `/launch` forwards to the active registered HTTPS client URL.
- Quest/browser runtime traffic uses HTTPS/WSS.
- Plain `ws://` exists only for the M5 device boundary.

## Fixed Architecture Decisions

1. Active runtime client is the routing source of truth.
   - `activeClientId` selects the concrete browser/Quest instance.
   - `activeExperienceId` is derived compatibility state, not an independent
     routing source.
   - `/launch` must redirect to the active registered client's HTTPS `url`.

2. There is one runtime handshake.
   - Experience clients use `client.hello`.
   - The Host responds with `client.registered` or `client.rejected`.
   - Clients keep presence alive with `client.heartbeat`.
   - No legacy registration message is part of the public experience contract.

3. The public client library must support standalone clients explicitly.
   - A client can be loaded from an experience origin and connect to a separate
     Host runtime origin.
   - Runtime URL resolution remains HTTPS/WSS only.

4. Documentation has one source of truth per topic.
   - `README.md` explains project purpose, audience, setup, and repository map.
   - `docs/client-api.md` is the canonical experience-client interface.
   - `docs/quest-https-launch-routing.md` owns detailed Quest/HTTPS setup.
   - `docs/PLAN.md` keeps implementation status and acceptance criteria.

5. Cleanup favors removal over parallel compatibility.
   - Remove unused scaffolding if it is not part of M1.
   - Do not keep two equivalent options in docs or code.
   - If a diagnostic path must remain, name it as diagnostics and keep it out of
     the public experience contract.

## Orchestration Rules

- Main thread owns integration, final architecture choices, and verification.
- Worker threads get disjoint write scopes.
- Workers must not revert existing user or other-agent changes.
- Workers must keep file headers on all new files.
- Workers must update or add focused tests for behavior changes.
- Workers must report changed file paths and checks run.
- No worker may add a new dependency without explicit approval in this thread.
- No UI route may be added.
- No HTTP fallback may be added for Quest/browser runtime surfaces.
- No M5 raw payload may enter client/experience-facing APIs.

## Work Threads

### Thread A: Documentation Readiness

Owner: docs worker.

Scope:

- `README.md`
- `docs/README.md`
- `docs/PLAN.md`
- `docs/client-api.md`
- `docs/client-prompt.md`
- `docs/quest-https-launch-routing.md`
- optional new docs under `docs/`

Tasks:

- Add HTW student/project context and related repository links to `README.md`.
- Make `docs/client-api.md` the canonical interface description.
- Add or fold in a concise experience-client checklist.
- Remove duplicated HTTPS setup text outside the canonical HTTPS doc.
- Mark historical logs as historical if they remain linked.

### Thread B: Runtime Contract Cleanup

Owner: runtime worker.

Scope:

- `src/lib/protocol/**`
- `src/lib/server/ws/**`
- `src/routes/console-state.svelte.ts`
- focused runtime tests

Tasks:

- Keep public runtime registration on `client.hello`.
- Keep operator diagnostics on `operator.diagnostic.register`.
- Keep `client.hello`, `client.registered`, `client.rejected`, and
  `client.heartbeat` as the single experience handshake.
- Preserve operator diagnostics without letting arbitrary runtime sockets become
  operator clients through a legacy alias.

### Thread C: Launch And Client Routing

Owner: routing/client worker.

Scope:

- `src/lib/server/experiences/**`
- `src/lib/server/station/**`
- `src/lib/server/ws/runtime-clients.ts`
- `src/lib/client/experience-client.ts`
- `src/routes/launch/+server.ts`
- focused tests

Tasks:

- Make `/launch` redirect to the selected online runtime client's registered
  HTTPS URL.
- Keep clear errors for no selected client, stale client, or non-HTTPS URL.
- Add explicit Host runtime origin support to the public client library.
- Keep runtime URL resolution WSS-only for browser/Quest clients.

### Thread D: Repository Cleanup

Owner: cleanup worker.

Scope:

- `.gitignore`
- tracked generated artifacts
- `src/lib/assets/favicon.svg`
- unused discovery/manifest scaffolding if confirmed unused
- import barrels directly affected by removed code

Tasks:

- Remove tracked Python bytecode from the repository.
- Ignore `__pycache__/` and `*.pyc`.
- Replace the default Svelte favicon with an Icaros Host placeholder asset.
- Remove unused M1-incompatible discovery scaffolding if no consumer exists.

### Thread E: Verification

Owner: main thread after integration.

Commands:

- `bun run check`
- `bun run lint`
- `bun run test`
- `bun run build`
- targeted smoke checks if runtime behavior changed

## Current Status

- Branch: `codex/prepare-github-push`
- Existing dirty files before implementation:
  - `docs/PLAN.md`
  - `docs/architecture.md`
  - `docs/client-api.md`
  - `docs/quest-https-launch-routing.md`
- Known tracked generated artifact:
  - `scripts/__pycache__/connect-m5-usb.cpython-314.pyc`

## Done Criteria

- README and docs describe one architecture without competing options.
- Experience client interface and checklist are current.
- Legacy runtime protocol paths are removed or clearly diagnostic-only.
- `/launch` cannot route to HTTP and uses the selected runtime client.
- Standalone clients can connect to a separate Host runtime origin over WSS.
- Generated artifacts are not tracked.
- Checks pass or remaining failures are documented with exact causes.
- Changes are staged, committed, merged to `main`, and pushed only after the
  implementation is verified.
