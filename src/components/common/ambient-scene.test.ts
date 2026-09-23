import { describe, expect, test } from "bun:test";
import {
  AMBIENT_MODEL_SEED,
  AMBIENT_STATIC_FRAME_TIME,
  createAmbientMotionModel,
  getAmbientCurrentPath,
  getAmbientSeedPose,
  getAmbientWebGpuCanvasSize,
  shouldAnimateAmbient,
} from "./ambient-scene";

describe("ambient scene rendering contract", () => {
  test("uses native DPR backing dimensions without a quality cap", () => {
    const size = getAmbientWebGpuCanvasSize(1280, 720, 3);

    expect(size.cssWidth).toBe(1280);
    expect(size.cssHeight).toBe(720);
    expect(size.backingWidth).toBe(3840);
    expect(size.backingHeight).toBe(2160);
    expect(size.backingWidth).toBeGreaterThanOrEqual(size.cssWidth);
    expect(size.backingHeight).toBeGreaterThanOrEqual(size.cssHeight);
    expect(size.pixelCount).toBe(3840 * 2160);
  });

  test("does not schedule nonessential motion for hidden or reduced-motion pages", () => {
    expect(shouldAnimateAmbient(false, false)).toBe(true);
    expect(shouldAnimateAmbient(true, false)).toBe(false);
    expect(shouldAnimateAmbient(false, true)).toBe(false);
  });

  test("creates a deterministic desktop and mobile motion model", () => {
    const desktop = createAmbientMotionModel(1440, 1000);
    const desktopAgain = createAmbientMotionModel(1440, 1000);
    const mobile = createAmbientMotionModel(393, 852);

    expect(desktop.seed).toBe(AMBIENT_MODEL_SEED);
    expect(desktop.seeds).toEqual(desktopAgain.seeds);
    expect(desktop.seeds).toHaveLength(12);
    expect(mobile.seeds).toHaveLength(7);
    expect(desktop.seeds.every((seed) => seed.size >= 16 && seed.size <= 38)).toBe(true);
  });

  test("keeps wind paths and seed poses inside the shared motion contract", () => {
    const model = createAmbientMotionModel(1440, 1000);
    const path = getAmbientCurrentPath(model, AMBIENT_STATIC_FRAME_TIME, 1);
    const pose = getAmbientSeedPose(model, model.seeds[0], AMBIENT_STATIC_FRAME_TIME);

    expect(path).toHaveLength(23);
    expect(path[0].x).toBe(-96);
    expect(path.at(-1)?.x).toBeGreaterThan(model.width);
    expect(pose.x).toBeGreaterThan(-model.seeds[0].size);
    expect(pose.x).toBeLessThan(model.width + model.seeds[0].size);
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.y).toBeLessThan(model.height);
  });
});
