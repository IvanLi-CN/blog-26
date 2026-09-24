import { describe, expect, test } from "bun:test";
import {
  AMBIENT_FRAME_INTERVAL_MS,
  AMBIENT_SEED_BUFFER_BYTES,
  ambientGpuLimitsSupportSize,
  ambientPerformanceScore,
} from "./ambient-performance";
import { getAmbientWebGpuCanvasSize } from "./ambient-scene";

describe("ambient performance capability profile", () => {
  test("keeps the visible scheduler at 30Hz", () => {
    expect(AMBIENT_FRAME_INTERVAL_MS).toBeCloseTo(33.333, 2);
  });

  test("assigns full detail when public limits have two times the required capacity", () => {
    const size = getAmbientWebGpuCanvasSize(1440, 1000, 2);
    expect(
      ambientPerformanceScore(
        {
          maxTextureDimension2D: Math.max(size.backingWidth, size.backingHeight) * 2,
          maxStorageBufferBindingSize: AMBIENT_SEED_BUFFER_BYTES * 2,
        },
        size
      )
    ).toBe(2);
  });

  test("keeps WebGPU at reduced detail when minimum limits are met", () => {
    const size = getAmbientWebGpuCanvasSize(1440, 1000, 2);
    expect(
      ambientPerformanceScore(
        {
          maxTextureDimension2D: Math.max(size.backingWidth, size.backingHeight),
          maxStorageBufferBindingSize: AMBIENT_SEED_BUFFER_BYTES,
        },
        size
      )
    ).toBe(1);
  });

  test("uses SVG only when a required public limit is insufficient", () => {
    const size = getAmbientWebGpuCanvasSize(1440, 1000, 2);
    expect(ambientPerformanceScore({ maxTextureDimension2D: 2048 }, size)).toBe(0);
    expect(ambientPerformanceScore({ maxStorageBufferBindingSize: 128 }, size)).toBe(0);
    expect(ambientGpuLimitsSupportSize({ maxTextureDimension2D: 2048 }, size)).toBe(false);
    expect(ambientGpuLimitsSupportSize({ maxStorageBufferBindingSize: 128 }, size)).toBe(false);
    expect(ambientGpuLimitsSupportSize({ maxTextureDimension2D: 8192 }, size)).toBe(true);
  });

  test("treats omitted mock limits as minimum-capability unknowns", () => {
    const size = getAmbientWebGpuCanvasSize(1440, 1000, 2);
    expect(ambientPerformanceScore(undefined, size)).toBe(1);
  });
});
