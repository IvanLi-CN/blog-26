import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  createRuntimeMetricMotion,
  createRuntimeMetricMotionPlan,
} from "../../site/lib/runtime-metric-motion";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

describe("runtime metric motion plans", () => {
  test("aligns digits from the right and caps large rotations", () => {
    const plan = createRuntimeMetricMotionPlan("999.99K", "1M");

    expect(plan.from).toBe("999.99K");
    expect(plan.to).toBe("1M");
    expect(plan.wheels.length).toBeGreaterThan(0);
    expect(plan.wheels.every((wheel) => wheel.cycles <= 3)).toBe(true);
    expect(plan.wheels.some((wheel) => wheel.from === "K" && wheel.to === "M")).toBe(true);
    expect(plan.wheels.some((wheel) => wheel.from === "9" && wheel.to === " ")).toBe(true);
  });

  test("follows the whole-value direction for carry and borrow", () => {
    const carry = createRuntimeMetricMotionPlan("19", "20");
    const borrow = createRuntimeMetricMotionPlan("20", "19");
    const wrappedCarry = createRuntimeMetricMotionPlan("1.10K", "1.19K");

    expect(carry.wheels.find((wheel) => wheel.from === "9" && wheel.to === "0")?.direction).toBe(
      "up"
    );
    expect(borrow.wheels.find((wheel) => wheel.from === "0" && wheel.to === "9")?.direction).toBe(
      "down"
    );
    expect(
      wrappedCarry.wheels.find((wheel) => wheel.from === "0" && wheel.to === "9")?.direction
    ).toBe("up");
  });

  test("does not create wheels when the display value is unchanged", () => {
    expect(createRuntimeMetricMotionPlan("2.11B", "2.11B").wheels).toEqual([]);
  });

  test("keeps static updates as the next animation source", () => {
    const browser = new Window();
    Object.assign(globalThis, { window: browser, document: browser.document });
    const value = document.createElement("strong");
    value.dataset.runtimeValueVisible = "1M";
    document.body.append(value);
    const controller = createRuntimeMetricMotion(value, {
      prefersReducedMotion: () => true,
      now: () => 0,
      frame: () => 1,
      cancelFrame: () => undefined,
    });

    controller.update("793.76K");

    expect(controller.currentText).toBe("793.76K");
    expect(controller.targetText).toBe("793.76K");
    expect(value.dataset.runtimeValueVisible).toBe("793.76K");
  });
});
