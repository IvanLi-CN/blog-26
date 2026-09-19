# ADR 0002: Mobile Public Header Scroll Model

- Status: accepted
- Date: 2026-09-19

## Context

The public Nature header is a single responsive shell shared by the frontend
routes. On narrow screens its full height competes with content, but replacing
it with a fixed clone or a second scroll container would change document flow,
focus order, and route-transition behavior. The header also needs different
reverse-scroll behavior for slow and fast gestures, with a deterministic
release state so it never rests half collapsed.

## Decision

Keep one real header in normal document flow and retain `position: sticky`.
The runtime measures the complete header height `H`, maintains a visible offset
`V` in `[0, H]`, and exposes `top = V - H` through a CSS custom property. A
positive document scroll delta reduces `V` one-for-one; a fast reverse gesture
restores it one-for-one after the configured direction and speed thresholds.
Slow reverse gestures do not actively reveal an already hidden header, while
scrolling to the document origin restores the expanded endpoint naturally.

The controller uses a short velocity sample window, a minimum reverse-distance
threshold, and a quiet release timer. Only the quiet timer may settle a partial
gesture: at least half-hidden snaps closed, a fast reverse recovery of at least
one fifth of the full height snaps open, and smaller movements return to the
gesture's starting endpoint. Fully collapsed descendants leave sequential Tab
order; a capture-phase focus handler expands the header before focus delivery.
Touch-active scrolling never starts that release timer; the timer begins only
after the final `touchend` or `touchcancel`, so a paused finger remains in
direct control of the current offset.

The behavior is enabled only below the public `640px` breakpoint, observes the
top-level window scroll stream, remeasures with `ResizeObserver`, and resets on
Astro ClientRouter swaps. Reduced-motion disables only the settling transition.

## Consequences

- The header and its document-flow placeholder remain a single source of layout
  truth across public routes and transitions.
- Scroll progress is continuous during a gesture while endpoint settling is
  deterministic and testable without depending on browser animation timing.
- Sticky positioning remains the browser-owned mechanism for reaching the top
  edge, while the controller owns only the mobile offset and interaction state.
- Desktop behavior, search contracts, route URLs, theme persistence, backend
  surfaces, and Storybook mocks remain outside this change.
