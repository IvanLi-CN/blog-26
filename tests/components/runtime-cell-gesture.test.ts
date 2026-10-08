import { describe, expect, test } from "bun:test";
import { createRuntimeTouchGestureController } from "../../site/components/projects/runtime-cell-gesture";

const point = (x: number, y: number, id = 1) => ({ id, x, y, radius: 8 });

describe("runtime cell touch gesture", () => {
  test("cancels a candidate after the jitter threshold and preserves native movement", () => {
    const gesture = createRuntimeTouchGestureController({ longPressMs: 1_000 });
    gesture.start(point(10, 10));

    const result = gesture.move([point(19, 10)]);

    expect(result.cancelled).toBe(true);
    expect(result.preventDefault).toBe(false);
    expect(gesture.phase).toBe("idle");
  });

  test("measures jitter from the original contact instead of each move", () => {
    const gesture = createRuntimeTouchGestureController({ longPressMs: 1_000 });
    gesture.start(point(10, 10));

    expect(gesture.move([point(16, 10)]).cancelled).toBe(false);
    const result = gesture.move([point(19, 10)]);

    expect(result.cancelled).toBe(true);
    expect(gesture.phase).toBe("idle");
  });

  test("recognizes a held contact, prevents inspection scrolling, and ends cleanly", async () => {
    let recognizedPoint: { x: number; y: number } | undefined;
    const gesture = createRuntimeTouchGestureController({
      longPressMs: 5,
      onRecognized: (recognized) => {
        recognizedPoint = recognized;
      },
    });
    gesture.start(point(10, 10));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(gesture.isInspecting()).toBe(true);
    expect(recognizedPoint).toMatchObject({ x: 10, y: 10 });
    const result = gesture.move([point(35, 20)]);
    expect(result.preventDefault).toBe(true);
    expect(result.point?.x).toBe(35);
    expect(gesture.end().recognized).toBe(true);
    expect(gesture.phase).toBe("idle");
  });
});
