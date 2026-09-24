import type { AmbientCanvasSize } from "./ambient-scene";

export const AMBIENT_TARGET_FPS = 30;
export const AMBIENT_FRAME_INTERVAL_MS = 1000 / AMBIENT_TARGET_FPS;
export const AMBIENT_SEED_BUFFER_BYTES = 12 * 8 * 4;

export type AmbientPerformanceScore = 0 | 1 | 2;
export type AmbientRenderTier = "full" | "conservative";

export type AmbientGpuLimits = {
  maxStorageBufferBindingSize?: number;
  maxTextureDimension2D?: number;
};

function limitAtLeast(value: number | undefined, required: number) {
  return value === undefined || value >= required;
}

function limitHasHeadroom(value: number | undefined, required: number) {
  return value !== undefined && value >= required * 2;
}

export function ambientGpuLimitsSupportSize(
  limits: AmbientGpuLimits | undefined,
  size: AmbientCanvasSize
) {
  return (
    limitAtLeast(limits?.maxStorageBufferBindingSize, AMBIENT_SEED_BUFFER_BYTES) &&
    limitAtLeast(limits?.maxTextureDimension2D, Math.max(size.backingWidth, size.backingHeight))
  );
}

export function ambientPerformanceScore(
  limits: AmbientGpuLimits | undefined,
  size: AmbientCanvasSize
): AmbientPerformanceScore {
  if (!ambientGpuLimitsSupportSize(limits, size)) return 0;

  const requiredDimension = Math.max(size.backingWidth, size.backingHeight);
  if (
    limitHasHeadroom(limits?.maxStorageBufferBindingSize, AMBIENT_SEED_BUFFER_BYTES) &&
    limitHasHeadroom(limits?.maxTextureDimension2D, requiredDimension)
  ) {
    return 2;
  }

  return 1;
}

export function ambientRenderTierForScore(score: AmbientPerformanceScore): AmbientRenderTier {
  return score === 2 ? "full" : "conservative";
}
