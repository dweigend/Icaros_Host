# AGENTS.md

Purpose: this file is the repository-local operating manual for coding agents
working on Icaros Host. Follow it before making code changes.

## Mission

Build Icaros Host as the station router, gateway, and translator.

The host is not the experience. The host owns devices, routing, sessions,
normalization, active experience state, and operator state. Experiences render WebXR and
consume a small normalized control API.

## Required First Steps

Before changing code:

1. Read `AGENTS.md`.
2. Read `README.md`.
3. Read `PLAN.md`.
4. Read `CODINGSTANDARDS.md`.
5. Inspect relevant `docs/**` and local folder `README.md` files.
6. Check the current worktree state.
7. Identify existing patterns before adding new ones.

If the task touches Svelte UI, inspect `/Users/weigend/Documents/GitHub/ui-system`
before designing components.

## Core Architecture Rules

- The UI is a single technical console page at `/`.
- Do not add UI subpages unless the user explicitly reopens that scope.
- WebSocket controls runtime clients.
- The operator decides the active experience id from `/`.
- The host stores `activeExperienceId`; the current MVP does not redirect or
  statically serve experience builds.
- The M5 sends raw data only to the host.
- Experiences receive only normalized control data.
- No experience may connect directly to the M5.
- No M5 raw data may be evaluated inside Three.js levels.
- Do not stream websites over WebSocket.
- Do not hard-code all experiences into host code.

## M1 Scope

Implement one station:

- `station-a`
- one Quest
- one M5
- one active experience
- many installed experience builds
- minimal operator UI
- template client library foundation
- local manifest discovery from finished `dist` folders

Prepare but do not fully implement:

- mDNS or LAN scan
- multi-session
- real Auth/RBAC
- Neural/ML
- production allowlists

## File And Module Rules

- New files start with a short purpose header.
- Public APIs should be easy to find near the top of a module.
- Helper functions should stay below public APIs.
- Keep modules small and concrete.
- Prefer explicit data flow through parameters.
- Do not hide global sources or defaults deep in implementation details.
- Use `index.ts` files for intentional public exports.
- Avoid deep imports from implementation files.

## TypeScript Rules

- No `any`.
- Validate external data before using it.
- Model invalid states out of the system where practical.
- Use discriminated unions and explicit result types for protocols.
- Use `import type` for type-only imports.
- Public functions should have explicit return types.

## UI Rules

- `src/lib/components` contains primitives.
- `src/lib/blocks` contains composed blocks.
- Route-specific UI remains in `src/routes`.
- Bits UI wrappers must stay thin.
- Use existing UI-system families before creating new ones.
- The operator UI should be dense, technical, and readable.

## Runtime Rules

- M5 compatibility is a boundary. Do not break the existing M5 message shapes.
- Runtime sockets must support HTTPS/WSS deployment when exposed to clients.
- Internal services may remain plain HTTP/WS behind the gateway.
- Prefer the single console page over route-level launch managers.
- Runtime objects with sockets, timers, events, or loops need explicit cleanup.
- Stale or disconnected M5 state must produce neutral safe-mode controls.

## Verification

Use the lightest checks that prove the change:

- `bun run check`
- `bun run lint`
- `bun run test` or `bun test`
- `bun run build`

If a check is not available yet because the project is still being scaffolded,
say so explicitly in the final report.

## Git Safety

- Never revert user changes unless explicitly asked.
- Never run destructive Git commands without explicit instruction.
- Keep changes small and reviewable.
