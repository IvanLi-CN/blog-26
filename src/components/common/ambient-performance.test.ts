import { describe, expect, test } from "bun:test";
import {
  AMBIENT_FRAME_INTERVAL_MS,
  AMBIENT_GPU_BUDGET_MS,
  AMBIENT_GPU_RECOVERY_MS,
  ambientGpuLimitsSupportSize,
  createAmbientPerformanceState,
  recordAmbientGpuSample,
} from "./ambient-performance";
import { getAmbientWebGpuCanvasSize } from "./ambient-scene";

describe("ambient performance governor", () => {
  test("uses the 30Hz frame budget and enters conservative mode after sustained pressure", () => {
    expect(AMBIENT_FRAME_INTERVAL_MS).toBeCloseTo(33.333, 2);
    const slow = AMBIENT_GPU_BUDGET_MS + 1;
    let state = createAmbientPerformanceState();
    state = recordAmbientGpuSample(state, slow);
    state = recordAmbientGpuSample(state, slow);
    expect(state.tier).toBe("full");
    state = recordAmbientGpuSample(state, slow);
    expect(state.tier).toBe("conservative");
    expect(state.fallback).toBe(false);
  });

  test("falls back only when conservative mode remains over budget", () => {
    const slow = AMBIENT_GPU_BUDGET_MS + 1;
    let state = createAmbientPerformanceState();
    for (let index = 0; index < 3; index += 1) state = recordAmbientGpuSample(state, slow);
    for (let index = 0; index < 5; index += 1) state = recordAmbientGpuSample(state, slow);
    expect(state.tier).toBe("conservative");
    expect(state.fallback).toBe(false);
    state = recordAmbientGpuSample(state, slow);
    expect(state.fallback).toBe(true);
  });

  test("recovers full detail only after a stable fast window", () => {
    let state = createAmbientPerformanceState();
    const slow = AMBIENT_GPU_BUDGET_MS + 1;
    for (let index = 0; index < 3; index += 1) state = recordAmbientGpuSample(state, slow);
    expect(state.tier).toBe("conservative");
    const fast = Math.max(0, AMBIENT_GPU_RECOVERY_MS - 1);
    for (let index = 0; index < 29; index += 1) state = recordAmbientGpuSample(state, fast);
    expect(state.tier).toBe("conservative");
    state = recordAmbientGpuSample(state, fast);
    expect(state.tier).toBe("full");
  });

  test("rejects adapter limits that cannot hold the native-DPR backing", () => {
    const size = getAmbientWebGpuCanvasSize(1440, 1000, 2);
    expect(ambientGpuLimitsSupportSize({ maxTextureDimension2D: 2048 }, size)).toBe(false);
    expect(ambientGpuLimitsSupportSize({ maxStorageBufferBindingSize: 128 }, size)).toBe(false);
    expect(ambientGpuLimitsSupportSize({ maxTextureDimension2D: 8192 }, size)).toBe(true);
  });
});
