# ADR 0004: Ambient Renderer Strategy

- Status: accepted
- Date: 2026-09-23

## Context

The public Nature shell carries a full-viewport ambient scene on every public
route. The scene uses three slowly moving wind paths and a small set of drifting
leaf shapes, so the renderer must preserve the visual language while avoiding
continuous high-cost work after a tab is backgrounded. SVG, layered Canvas 2D,
and WebGPU were considered against the same deterministic motion model.

## Decision

Use a layered Canvas 2D renderer as the production ambient renderer.

The renderer keeps one Canvas for the wind paths and one Canvas for the leaf
sprites. It caps backing pixels, caches leaf sprites, limits active animation to
the low-frequency scene cadence, pauses while the document is hidden, and
renders a single stable frame for reduced-motion users. The motion model is
deterministic so visual verification can compare desktop, mobile, theme, and
reduced-motion states.

The final public bundle contains no renderer selector, benchmark diagnostics,
SVG backend, or WebGPU fallback. A future renderer change requires a successor
ADR when its performance or compatibility trade-offs differ from this decision.

## Alternatives Considered

- SVG retained-mode animation reduced JavaScript drawing work, but its animated
  path geometry produced substantially more paint/compositor activity for this
  full-viewport scene.
- WebGPU provided a valid adapter/device path and is the better scaling option
  for a much denser or shader-heavy scene, but its browser/device lifecycle and
  command-submission overhead did not produce a more stable result for the
  current low-complexity effect.

## Evidence

The renderer comparison used deterministic Canvas and WebGPU fixtures with
foreground-on and foreground-off states. Trace values were treated as
GPU/compositor proxies, not system GPU percentage, power, or battery data. The
corrected real-tab protocol exposed active-page scheduler throttling in the
automation window, so its four cases were marked `scheduler-limited` and were
not used as a causal performance ranking. The decision rests on the current
effect's low geometric complexity, Canvas's predictable lifecycle and fallback
behavior, the shared visual contract, and the tuned backing budgets.

Desktop and `393x852` light/dark/reduced-motion captures preserve the shared
wind-path and leaf-count contract.

## Consequences

- The current effect favors predictable browser compatibility and stable
  low-load behavior over a more complex GPU abstraction.
- Two Canvas backing stores use more raw backing pixels than one WebGPU Canvas,
  but the extra allocation buys a simple wind/leaf quality boundary and a
  predictable browser fallback for this scene.
- Increasing particle count, adding shader-heavy post-processing, or changing
  the full-viewport effect materially reopens the renderer decision.
