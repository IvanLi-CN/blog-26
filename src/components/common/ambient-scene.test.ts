import { describe, expect, test } from "bun:test";
import {
  AMBIENT_FRAME_RATE,
  AMBIENT_MAX_CANVAS_PIXELS,
  AMBIENT_MIN_SEED_SCALE,
  AMBIENT_MIN_WIND_SCALE,
  AMBIENT_WIND_TARGET_PIXELS,
  createAmbientMotionModel,
  getAmbientCanvasSize,
  getAmbientCurrentPath,
  getAmbientSeedPose,
  shouldAnimateAmbient,
} from "./ambient-scene";

describe("ambient scene performance budget", () => {
  test("keeps the wind layer at CSS-pixel resolution on a high-density desktop", () => {
    const size = getAmbientCanvasSize(2336, 1329, 2);

    expect(size.wind.scale).toBeGreaterThanOrEqual(AMBIENT_MIN_WIND_SCALE);
    expect(size.wind.backingWidth).toBeGreaterThanOrEqual(size.cssWidth);
    expect(size.wind.backingHeight).toBeGreaterThanOrEqual(size.cssHeight);
    expect(size.wind.pixelCount).toBeGreaterThanOrEqual(size.cssWidth * size.cssHeight);
    expect(size.wind.pixelCount).toBeLessThanOrEqual(AMBIENT_WIND_TARGET_PIXELS * 1.02);
  });

  test("keeps the leaf layer bounded while preserving a minimum sampling floor", () => {
    const size = getAmbientCanvasSize(1280, 720, 3);

    expect(size.seeds.scale).toBeLessThanOrEqual(1.25);
    expect(size.seeds.scale).toBeGreaterThanOrEqual(AMBIENT_MIN_SEED_SCALE);
    expect(size.seeds.pixelCount).toBeLessThanOrEqual(AMBIENT_MAX_CANVAS_PIXELS);
    expect(size.pixelCount).toBe(size.wind.pixelCount + size.seeds.pixelCount);
  });

  test("keeps both backing layers within budget on very large displays", () => {
    const size = getAmbientCanvasSize(3840, 2160, 2);

    expect(size.wind.pixelCount).toBeLessThanOrEqual(AMBIENT_WIND_TARGET_PIXELS);
    expect(size.seeds.pixelCount).toBeLessThanOrEqual(AMBIENT_MAX_CANVAS_PIXELS);
  });

  test("does not schedule nonessential motion for hidden or reduced-motion pages", () => {
    expect(AMBIENT_FRAME_RATE).toBe(24);
    expect(shouldAnimateAmbient(false, false)).toBe(true);
    expect(shouldAnimateAmbient(true, false)).toBe(false);
    expect(shouldAnimateAmbient(false, true)).toBe(false);
  });

  test("creates a deterministic desktop and mobile motion model", () => {
    const desktop = createAmbientMotionModel(1440, 1000);
    const desktopAgain = createAmbientMotionModel(1440, 1000);
    const mobile = createAmbientMotionModel(393, 852);

    expect(desktop.seeds).toEqual(desktopAgain.seeds);
    expect(desktop.seeds).toHaveLength(12);
    expect(mobile.seeds).toHaveLength(7);
    expect(desktop.seeds.every((seed) => seed.size >= 16 && seed.size <= 38)).toBe(true);
  });

  test("keeps wind paths and seed poses inside the shared motion contract", () => {
    const model = createAmbientMotionModel(1440, 1000);
    const path = getAmbientCurrentPath(model, 12_000, 1);
    const pose = getAmbientSeedPose(model, model.seeds[0], 12_000);

    expect(path).toHaveLength(23);
    expect(path[0].x).toBe(-96);
    expect(path.at(-1)?.x).toBeGreaterThan(model.width);
    expect(pose.x).toBeGreaterThan(-model.seeds[0].size);
    expect(pose.x).toBeLessThan(model.width + model.seeds[0].size);
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.y).toBeLessThan(model.height);
  });
});
