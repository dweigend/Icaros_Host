# Components Layer

Purpose: this folder contains local UI primitives for the single-page Icaros
Host operator console. It follows the ui-system primitive-family style where it
is useful, but it stays smaller than the upstream design system while the M1 UI
has only a few controls.

## Boundary

- Import reusable primitives through `$lib/components` or the family `index.ts`.
- Keep route-specific console panels in `src/routes/_console`.
- Do not import from a future `src/lib/blocks` layer into primitives.
- Keep Bits UI wrappers thin and let Bits own accessibility, keyboard behavior,
  and state machines.
- Add or complete a family README when a primitive becomes reusable outside its
  first route use.

The current `select` wrapper is intentionally small. Before expanding it as a
general primitive, either move one-off behavior route-local or complete the full
family schema with README, types, exports, and tests as needed.
