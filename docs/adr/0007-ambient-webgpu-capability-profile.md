# ADR 0007: Ambient WebGPU Capability Profile

- Status: accepted
- Date: 2026-09-24
- Supersedes: [ADR 0006: Ambient WebGPU Strategy](./0006-ambient-webgpu-strategy.md)

## Context

The ambient WebGPU renderer must keep its native device-pixel backing and
approximately 30Hz motion without allowing a transient queue delay to replace
the animated scene with a static fallback. Browser rendering time is not a
stable capability signal and `GPUQueue.onSubmittedWorkDone()` is not needed by
this visual model.

## Decision

Use only mainstream WebGPU and media-query capability signals for renderer
selection: `prefers-reduced-motion`, `navigator.gpu`, adapter request success,
adapter public `features` and `limits`, context/pipeline initialization, and
`device.lost`. Reduced-motion remains a hard rule and uses the complete static
SVG scene without requesting WebGPU. Unsupported WebGPU or an actual lifecycle
failure uses the same SVG scene.

After the native-DPR canvas size is known, compute an internal
`performanceScore` from the adapter's public limits and the fixed seed buffer:

- `2` means both the maximum texture dimension and storage-buffer binding size
  have at least two times the required capacity. WebGPU draws the complete
  scene, including leaf outlines.
- `1` means the minimum native-DPR backing and fixed buffer requirements are
  met. WebGPU remains active but omits the non-essential leaf outline pass.
- `0` means a required limit is insufficient. The coordinator uses SVG rather
  than lowering DPR or reducing color quality.

The score is evaluated from stable capability data and never changes in
response to queue completion promises, elapsed GPU time, frame timing, private
browser fields, vendor tables, or hardware heuristics. Hidden documents stop
submitting commands; visible documents retain the existing approximately 30Hz
requestAnimationFrame scheduler.

## Consequences

- A temporarily delayed GPU queue cannot freeze the motion model or trigger a
  renderer switch.
- Lower-capability but valid adapters keep WebGPU and lose only the outline
  detail, while native-DPR backing remains mandatory.
- WebGPU initialization and device loss remain real compatibility failures and
  continue to use the complete vector SVG fallback.
- No browser-specific performance score is exposed to application code or the
  public bundle.
