# AGENTS.md

Purpose: repository-local operating manual for agents working on Icaros Host.
Keep changes small, pragmatic, and aligned with the current architecture.

## Current Phase

Icaros Host is close to feature-complete for the local station use case. Default
work is now refinement:

- Refactor toward clearer boundaries, shorter files, and simpler data flow.
- Improve efficiency, reliability, and startup/runtime ergonomics.
- Reduce code before adding code; remove duplication and unused abstraction.
- Add mini features only when they fit the existing host model cleanly.
- Preserve runtime contracts, M5 compatibility, and Quest HTTPS/WSS behavior.

The host remains the station router, gateway, and translator. It owns devices,
routing, sessions, normalized controls, active experience state, and operator
state. Experiences render WebXR and consume only the normalized control API.

## Before Changing Code

1. Read `AGENTS.md`, `README.md`, and the relevant docs for the touched area.
2. Inspect local folder `README.md` files.
3. Check `git status` and never revert user changes unless explicitly asked.
4. Identify existing services, utilities, components, and patterns first.
5. Prefer standard library, then existing dependencies, then established new
   libraries, and only then custom code.

For Svelte UI work, inspect `/Users/weigend/Documents/GitHub/ui-system` before
designing components. For Bits UI work, check the official docs through
Context7 first.

## Architecture Rules

- `/` is the single technical operator console page.
- Do not add UI subpages unless explicitly requested.
- `/launch` redirects only to the selected registered runtime client's HTTPS
  URL; it must not fall back to defaults or `http://`.
- Runtime clients register over `/ws/runtime`; control subscribers read
  normalized data from `/ws/control/main`.
- The M5 sends raw frames only to the host. Experiences must never connect
  directly to the M5 or evaluate raw M5 data.
- Do not stream websites over WebSocket.
- Do not hard-code all experiences into host code.
- Keep plain `ws://` limited to the M5 device boundary; Quest/browser runtime
  surfaces use HTTPS/WSS.

## Refactor Priorities

- Preserve behavior unless the task explicitly changes it.
- Simplify first: delete dead code, merge duplicate paths, and remove unused
  configuration before adding abstractions.
- Prefer small functions, explicit parameters, early returns, and clear
  lifecycle methods such as `start()`, `stop()`, and `dispose()`.
- Split long functions or broad modules when it improves ownership and testable
  boundaries.
- Keep runtime objects with sockets, timers, events, or loops explicitly
  disposable.
- Keep stale or disconnected M5 state in neutral safe-mode controls.

## TypeScript And Modules

- No `any`; validate external data before it enters domain logic.
- Use explicit public return types, `import type`, readonly data, discriminated
  unions, and result types where they prevent invalid states.
- New files start with a short header explaining purpose, responsibility, and
  boundaries.
- Public APIs should be easy to find near the top of a module.
- Use `index.ts` files for intentional public exports and avoid deep imports
  from implementation files.

## UI Rules

- `src/lib/components` contains primitives.
- `src/lib/blocks` contains composed reusable blocks.
- Route-specific UI remains in `src/routes`.
- Bits UI wrappers stay thin and preserve official behavior, accessibility,
  focus management, keyboard navigation, and portal semantics.
- The operator UI should stay dense, technical, readable, and efficient for
  repeated station operation.

## Verification

Run the lightest checks that prove the change:

- `bun run check`
- `bun run lint`
- `bun run test` or `bun test`
- `bun run build`

If a check is unavailable or not relevant, state that explicitly in the final
report.
