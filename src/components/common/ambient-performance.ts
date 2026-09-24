import type { AmbientCanvasSize } from "./ambient-scene";

export const AMBIENT_TARGET_FPS = 30;
export const AMBIENT_FRAME_INTERVAL_MS = 1000 / AMBIENT_TARGET_FPS;
export const AMBIENT_GPU_BUDGET_MS = AMBIENT_FRAME_INTERVAL_MS * 0.75;
export const AMBIENT_GPU_RECOVERY_MS = AMBIENT_FRAME_INTERVAL_MS * 0.4;
export const AMBIENT_SEED_BUFFER_BYTES = 12 * 8 * 4;

const SLOW_SAMPLES_TO_CONSERVATIVE = 3;
const SLOW_SAMPLES_TO_FALLBACK = 6;
const FAST_SAMPLES_TO_RECOVER = 30;

export type AmbientRenderTier = "full" | "conservative";

export type AmbientGpuLimits = {
  maxStorageBufferBindingSize?: number;
  maxTextureDimension2D?: number;
};

export type AmbientPerformanceState = {
  tier: AmbientRenderTier;
  slowSamples: number;
  recoverySamples: number;
  fallback: boolean;
};

export function createAmbientPerformanceState(): AmbientPerformanceState {
  return { tier: "full", slowSamples: 0, recoverySamples: 0, fallback: false };
}

export function ambientGpuLimitsSupportSize(
  limits: AmbientGpuLimits | undefined,
  size: AmbientCanvasSize
) {
  return (
    (limits?.maxStorageBufferBindingSize === undefined ||
      limits.maxStorageBufferBindingSize >= AMBIENT_SEED_BUFFER_BYTES) &&
    (limits?.maxTextureDimension2D === undefined ||
      (size.backingWidth <= limits.maxTextureDimension2D &&
        size.backingHeight <= limits.maxTextureDimension2D))
  );
}

export function recordAmbientGpuSample(
  state: AmbientPerformanceState,
  elapsedMs: number
): AmbientPerformanceState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || state.fallback) return state;

  if (elapsedMs > AMBIENT_GPU_BUDGET_MS) {
    const slowSamples = state.slowSamples + 1;
    if (state.tier === "conservative" && slowSamples >= SLOW_SAMPLES_TO_FALLBACK) {
      return { ...state, slowSamples, recoverySamples: 0, fallback: true };
    }
    if (state.tier === "full" && slowSamples >= SLOW_SAMPLES_TO_CONSERVATIVE) {
      return { tier: "conservative", slowSamples: 0, recoverySamples: 0, fallback: false };
    }
    return { ...state, slowSamples, recoverySamples: 0 };
  }

  if (state.tier === "conservative" && elapsedMs < AMBIENT_GPU_RECOVERY_MS) {
    const recoverySamples = state.recoverySamples + 1;
    if (recoverySamples >= FAST_SAMPLES_TO_RECOVER) {
      return { tier: "full", slowSamples: 0, recoverySamples, fallback: false };
    }
    return { ...state, slowSamples: 0, recoverySamples };
  }

  return { ...state, slowSamples: 0, recoverySamples: 0 };
}
