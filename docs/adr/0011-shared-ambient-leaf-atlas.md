# ADR 0011: Shared Ambient Leaf Atlas

- Status: accepted
- Date: 2026-10-03
- Supersedes: [ADR 0007: Ambient WebGPU Capability Profile](./0007-ambient-webgpu-capability-profile.md)

## Context

Independent GPU fill triangles, outline vertices, and SVG paths produce
different silhouettes. The approved Nature background needs recognizable,
quiet broad and willow leaves in both renderers. Omitting the entire outline
on a minimum-capability adapter also removes essential leaf structure.

## Decision

Use one vector master for each leaf, including its blade, curved stem, main
rib, and secondary veins. SVG creates explicitly styled independent paths.
WebGPU samples a transparent, theme-independent four-tile mask atlas generated
from those same paths; its instanced quads apply the shared motion and palette.
Rasterization uses twice the largest leaf's native-DPR density and two texels
of transparent isolation. Theme changes do not rebuild the atlas.

Preserve native-DPR backing, approximately 30Hz motion, hidden-document pause,
and the capability-only renderer decision. Check public adapter/device limits
against the canvas, atlas, and fixed seed buffer. Score 2 has double capacity
and draws full detail; score 1 meets minimum capacity and omits only secondary
veins. Both keep the blade outline, stem, and primary rib. Score 0, reduced
motion, initialization failure, or device loss uses complete vector SVG.

Keep SVG visible until initial GPU resources are ready. DPR replacement keeps
the previous resources until the new atlas is ready. Stale asynchronous work
is discarded and every bitmap, texture, buffer, and callback is released.

## Consequences

- Shape and opacity changes have one source and can be compared at a fixed frame.
- One small atlas replaces separate hand-maintained GPU leaf meshes without a
  tessellation dependency. Rasterization adds an asynchronous initialization
  step, resource lifetime management, and a texture-limit requirement.
- Supersampling keeps small curved leaves sharp while vector SVG remains the
  compatibility fallback. Unsupported dimensions do not lower native DPR.
- Browser-rendered GPU evidence is required; mocked pipeline tests alone do
  not prove shape, alpha blending, or shader validity.
