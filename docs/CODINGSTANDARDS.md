# Coding Standards

Purpose: this document defines engineering standards for Icaros Host. It is
intended for coding agents and humans who need to keep the system clear,
reviewable, and learnable for students.

## Working Style

- Work like a pragmatic senior engineer.
- Read `AGENTS.md`, `README.md`, `docs/PLAN.md`, relevant `docs/**`, and local
  `README.md` files before changing code.
- Do not change code blindly.
- Search for existing patterns, utilities, and APIs before creating new ones.
- Prefer standard library first, existing dependencies second, established
  libraries third, and custom code last.
- Implement the smallest viable solution.
- Work in small, reviewable steps.
- Preserve behavior unless a functional change is explicitly requested.
- Remove or simplify complexity before adding abstractions.

## Architecture

- The host is a router, gateway, and translator. It is not an experience.
- Prefer the simplest explicit state surface over orchestration layers. In the
  current M1 slice, `/` is the only UI page and owns the operator console.
- `src/lib` is library code with small, clear responsibilities.
- `src/routes` is for route composition, screens, debugging, and route-local
  experiments.
- Each library folder should have a clear concept and intentional exports.
- Public imports should flow through `index.ts` files.
- Avoid deep imports from implementation files.
- Compose multiple library layers visibly at the boundary, not inside hidden
  convenience managers.
- Make dimensions, seeds, colors, keymaps, ports, and runtime options explicit.
- Fail early and clearly when required values are missing.

## TypeScript

- Write with `strict` in mind.
- Do not use `any`.
- Use precise types and explicit public return types.
- Use `Readonly`, `readonly` arrays, discriminated unions, template literal
  types, and domain types where they prevent invalid states.
- Use `import type` for type-only imports.
- Validate external, network, filesystem, and user-controlled data before using
  it in library logic.
- Prefer explicit success/error models such as `{ ok: true } | { ok: false }`.
- Deterministic logic uses explicit seeds, not direct `Math.random()`.

## Code Style

- Use clear names, small functions, and low nesting.
- Prefer early returns when they improve readability.
- Avoid god objects and broad helper layers without proven need.
- Comments explain why, constraints, and tradeoffs. They do not narrate obvious
  code.
- Every new file starts with a short header comment or Markdown purpose section
  that explains responsibility and boundaries.
- Public APIs get short JSDoc when they expose a concept, boundary, side effect,
  or important error case.

## Documentation

- Documentation must explain architecture, not just features.
- Every library folder should have a `README.md` when it owns a concept or
  architectural boundary.
- Docs describe responsibility, non-goals, assumptions, inputs, outputs, and
  failure modes.
- Examples should be small, realistic, and directly runnable.
- Keep docs current with code. Outdated docs are worse than short docs.
- Do not promise behavior that the code does not support.
- Put complex decisions in `README.md`, architecture docs, or short comments at
  the relevant boundary.
- Use calm, explicit names so students can follow the data flow.

## Svelte And UI

- UI primitives belong in `src/lib/components`.
- Composed blocks belong in `src/lib/blocks`.
- Route-specific UI stays in `src/routes`.
- Use `/Users/weigend/Documents/GitHub/ui-system` as the primary design and
  structure reference.
- Keep Bits UI wrappers thin and preserve official Bits behavior.
- CSS belongs to the owning family and should be imported through that family's
  public entry point.
- `src/app.css` is only for global tokens, reset/base styles, and app shell
  foundations.

## Three.js And Runtime

- Renderer-free modules must not know about Three.js, Svelte, DOM, or runtime
  lifecycle.
- Three.js adapters translate explicit data into objects. They do not decide
  game rules.
- Code that creates GPU or Three.js resources owns cleanup.
- Runtime objects with events, animation loops, sockets, or scene attachments
  need clear `start()`, `stop()`, or `dispose()` lifecycle functions.

## Refactoring

- Preserve behavior.
- Search existing patterns first.
- Do one coherent refactor per step.
- Prioritize long functions, deep nesting, duplication, magic values, and vague
  names.
- Add abstractions only when they remove real repetition or clarify a concept.

## Verification

- After TypeScript or Svelte changes, run `bun run check`.
- After code or docs in Biome scope, run `bun run lint`.
- For tests, run `bun run test` or `bun test`.
- For routing, layout, runtime, or build behavior, run `bun run build`.
- After architecture changes, inspect import boundaries intentionally.

## Git Safety

- Check status before changes.
- Do not reset changes you did not make.
- Do not use destructive Git commands without explicit instruction.
- Commit only small, finished units when a commit is requested.
