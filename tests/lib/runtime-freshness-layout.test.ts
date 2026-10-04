import { describe, expect, test } from "bun:test";
import { calculateFreshnessLayout } from "../../site/lib/runtime-freshness-layout";

describe("runtime freshness layout", () => {
  test("reserves the lower region for an empty repository list", () => {
    expect(calculateFreshnessLayout(0, 280, 160, 2.88)).toEqual({
      columns: 30,
      rows: 1,
      gap: 0,
      cellSize: 0,
    });
    expect(calculateFreshnessLayout(0, 0, 160, 2.88)).toBeNull();
  });

  test("fits complete square cells at ordinary and dense counts", () => {
    for (const count of [1, 30, 31, 502, 3000, 10000]) {
      for (const [width, height] of [
        [280, 160],
        [220, 95],
        [380, 230],
      ]) {
        const layout = calculateFreshnessLayout(count, width, height, 2.88);
        expect(layout).not.toBeNull();
        if (!layout) continue;
        expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(count);
        expect(layout.cellSize).toBeGreaterThan(0);
        expect(layout.cellSize).toBeLessThanOrEqual(8);
        expect(layout.gap).toBeGreaterThanOrEqual(0);
        expect(
          layout.columns * layout.cellSize + (layout.columns - 1) * layout.gap
        ).toBeLessThanOrEqual(width + 0.001);
        expect(layout.rows * layout.cellSize + (layout.rows - 1) * layout.gap).toBeLessThanOrEqual(
          height + 0.001
        );
      }
    }
  });

  test("rejects hidden or invalid layout measurements", () => {
    expect(calculateFreshnessLayout(502, 280, 0, 2.88)).toBeNull();
    expect(calculateFreshnessLayout(-1, 280, 160, 2.88)).toBeNull();
    expect(calculateFreshnessLayout(1.5, 280, 160, 2.88)).toBeNull();
  });
});
