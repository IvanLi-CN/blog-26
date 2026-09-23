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
