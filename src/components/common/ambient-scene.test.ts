import { describe, expect, test } from "bun:test";
import {
  AMBIENT_FRAME_RATE,
  AMBIENT_MAX_CANVAS_PIXELS,
  createAmbientMotionModel,
  getAmbientCanvasSize,
  getAmbientCurrentPath,
  getAmbientSeedPose,
  shouldAnimateAmbient,
} from "./ambient-scene";

describe("ambient scene performance budget", () => {
  test("caps a high-density desktop canvas within its backing-pixel budget", () => {
    const size = getAmbientCanvasSize(2336, 1329, 2);

    expect(size.pixelCount).toBeLessThanOrEqual(AMBIENT_MAX_CANVAS_PIXELS);
    expect(size.scale).toBeLessThan(1);
  });

  test("keeps ordinary viewports below the capped device pixel ratio", () => {
    const size = getAmbientCanvasSize(1280, 720, 3);

    expect(size.scale).toBeLessThanOrEqual(1.25);
    expect(size.pixelCount).toBeLessThanOrEqual(AMBIENT_MAX_CANVAS_PIXELS);
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
