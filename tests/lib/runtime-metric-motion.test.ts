import { describe, expect, test } from "bun:test";
import { createRuntimeMetricMotionPlan } from "../../site/lib/runtime-metric-motion";

describe("runtime metric motion plans", () => {
  test("aligns digits from the right and caps large rotations", () => {
    const plan = createRuntimeMetricMotionPlan("999.99K", "1M");

    expect(plan.from).toBe("999.99K");
    expect(plan.to).toBe("1M");
    expect(plan.wheels.length).toBeGreaterThan(0);
    expect(plan.wheels.every((wheel) => wheel.cycles <= 3)).toBe(true);
    expect(plan.wheels.some((wheel) => wheel.from === "K" && wheel.to === "M")).toBe(true);
  });

  test("uses the shortest direction for digit carry and borrow", () => {
    const carry = createRuntimeMetricMotionPlan("19", "20");
    const borrow = createRuntimeMetricMotionPlan("20", "19");

    expect(carry.wheels.find((wheel) => wheel.from === "9" && wheel.to === "0")?.direction).toBe(
      "up"
    );
    expect(borrow.wheels.find((wheel) => wheel.from === "0" && wheel.to === "9")?.direction).toBe(
      "down"
    );
  });

  test("does not create wheels when the display value is unchanged", () => {
    expect(createRuntimeMetricMotionPlan("2.11B", "2.11B").wheels).toEqual([]);
  });
});
