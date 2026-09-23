# Ambient Renderer Quality And Benchmark Protocol

- Status: accepted
- Date: 2026-09-23

The ambient scene keeps separate backing-size policies for its two Canvas
layers: the wind layer never renders below one CSS pixel per backing pixel,
while the leaf-sprite layer retains a bounded budget with a `0.75` minimum
scale. Wind paths use midpoint quadratic interpolation and the cached leaf
sprites are rendered at `256x160`, preserving the deterministic path and pose
model while removing the most visible low-resolution stair-stepping. This
resolves visible line upscaling without allowing the full scene to inherit an
unconstrained device-pixel ratio. The selection comparison used separate static
Canvas and WebGPU fixtures with the same deterministic model and a toggleable
project-wall foreground. Lifecycle, GPU-service, paint/raster, frame, and
backing-buffer values remain browser proxy measurements rather than system GPU
or power claims. The temporary fixtures and diagnostics are removed from the
final public delivery; the production surface remains the layered Canvas
renderer recorded in ADR 0004.

## Controlled Browser Result

The final controlled run used the production-equivalent two-layer Canvas
fixture, a native WebGPU fixture, one blank tab, and three visible/hidden/
return cycles per case. Each window was three seconds because the host locked
the session during the original ten-second protocol. The page reported a real
`visibilitychange` transition for every cycle and recorded zero draw calls
while hidden.

| Renderer | Foreground | P95 frame interval | P95-equivalent FPS | Hidden draws | Backing pixels |
| --- | --- | ---: | ---: | ---: | ---: |
| Layered Canvas | off | 17.6 ms | 56.8 | 0 | 9,994,920 |
| Layered Canvas | on | 17.4 ms | 57.5 | 0 | 9,994,920 |
| WebGPU | off | 17.6 ms | 56.8 | 0 | 4,997,460 |
| WebGPU | on | 17.5 ms | 57.1 | 0 | 4,997,460 |

The frame values are the P95 interval reported by the fixture (`1000 / ms`)
and are not an average FPS counter. Diagnostic draw counters were 1,519 and
1,417 for Canvas, and 1,314 and 1,499 for WebGPU, respectively, over the
shortened run; because browser automation adds variable time between tab
clicks, those counters are directional only and are not used as a ranking
metric. WebGPU therefore wins the raw backing-pixel comparison, but neither
backend shows a stable frame-time advantage for this low-complexity effect.
The production choice remains layered Canvas because it preserves the tuned
visual quality with simpler lifecycle behavior and broader fallback coverage.
