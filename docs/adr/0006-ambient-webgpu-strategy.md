# ADR 0006: Ambient WebGPU Strategy

- Status: superseded
- Date: 2026-09-24
- Supersedes: [ADR 0004: Ambient Renderer Strategy](./0004-ambient-renderer-strategy.md)
- Superseded by: [ADR 0007: Ambient WebGPU Capability Profile](./0007-ambient-webgpu-capability-profile.md)

## Context

The public Nature shell needs a visible ambient scene without lowering its
native-pixel quality. The scene is small enough for a single WebGPU pipeline,
but WebGPU support and device lifecycle behavior are not universal. The
existing layered Canvas renderer is predictable, but it is no longer the
selected production path.

## Decision

Use one transparent, native-DPR WebGPU Canvas as the production renderer for
normal-motion pages. The page's existing themed CSS background remains below
the canvas; the render pass clears with alpha zero and uses premultiplied
alpha, so WebGPU draws only the three wind paths and responsive leaf instances.
Visible pages use requestAnimationFrame as a clock and submit at approximately
30Hz, avoiding unnecessary GPU work while keeping motion continuous. Hidden
documents stop submitting commands and resume on return.

Use one complete, deterministic SVG scene as the fallback. It contains three
independent wind paths and seven or twelve independent leaf groups, depending
on viewport width, with no animation elements. The SVG uses the same theme CSS
variables as the page background and is also the renderer for reduced-motion
users. Reduced-motion is checked before requesting a WebGPU adapter.

If WebGPU is absent, adapter/device/context/pipeline creation fails, or the
device is lost, the coordinator keeps or replaces the scene with the static
SVG without leaving a timer or animation frame loop behind. Renderer selection
is runtime capability detection only; the production bundle contains no
benchmark selector or diagnostics object.

Before the first resize, the renderer checks the adapter's public limits against
the required native-DPR backing dimensions and fixed seed storage buffer. A
limit failure selects SVG; the renderer never lowers devicePixelRatio to fit a
weak adapter. The superseding capability profile removes the runtime queue
completion governor and defines deterministic WebGPU detail tiers from public
adapter limits only.

## Alternatives Considered

- Layered Canvas 2D remains a viable compatibility implementation, but it is
  no longer the preferred normal-motion path after the controlled renderer
  comparison and the requirement for a smooth, approximately 30Hz visible
  animation.
- Animated SVG was rejected because retained-mode path and transform animation
  creates unnecessary browser paint/compositor work for the full-viewport
  scene.
- WebGL and full-screen post-processing were rejected because they add another
  compatibility and fill-rate path without improving this low-complexity
  visual model.

## Consequences

- WebGPU initialization and device-loss handling become part of the public
  shell lifecycle, while unsupported or reduced-motion environments remain
  deterministic and sharp through SVG.
- The WebGPU Canvas must keep its backing dimensions at native CSS size times
  devicePixelRatio; allocation failure is a compatibility fallback, not a
  reason to lower visual quality.
- The superseding capability profile provides explicit behavior for lower-
  capability devices without introducing a vendor or browser model table. The
  visual quality floor remains native-DPR rendering or the complete vector SVG
  fallback.
- ADR 0004 and ADR 0005 remain historical records of the Canvas decision and
  benchmark protocol. This ADR is the active renderer decision.
