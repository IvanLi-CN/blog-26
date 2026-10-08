import { describe, expect, test } from "bun:test";
import { calculateFreshnessLayout } from "../../site/lib/runtime-freshness-layout";

describe("runtime freshness layout", () => {
  test("reserves the lower region for an empty repository list", () => {
    expect(calculateFreshnessLayout(0, 280, 160, 2.88)).toEqual({
      columns: 30,
      rows: 0,
      gap: 0,
      cellSize: 0,
      gridHeight: 0,
    });
    expect(calculateFreshnessLayout(0, 0, 160, 2.88)).toBeNull();
  });

  test("fits complete square cells at ordinary and dense counts", () => {
    for (const count of [1, 2, 30, 31, 502, 503, 3000, 10000]) {
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
        expect(layout.gridHeight).toBeGreaterThan(0);
        expect(layout.columns * layout.cellSize + (layout.columns - 1) * layout.gap).toBeCloseTo(
          width,
          8
        );
        expect(layout.gridHeight).toBeLessThanOrEqual(height + 0.001);
        expect(layout.rows * layout.cellSize + (layout.rows - 1) * layout.gap).toBeCloseTo(
          layout.gridHeight,
          8
        );
      }
    }
  });

  test("fills every complete row while leaving only the final row incomplete", () => {
    const layout = calculateFreshnessLayout(503, 280, 160, 2.88);
    expect(layout).not.toBeNull();
    if (!layout) return;

    const firstRowWidth = layout.columns * layout.cellSize + (layout.columns - 1) * layout.gap;
    expect(firstRowWidth).toBeCloseTo(280, 8);
    expect(layout.gridHeight).toBeLessThanOrEqual(160 + 0.001);
    expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(503);
    expect(layout.columns).toBeGreaterThanOrEqual(30);
  });

  test("rejects hidden or invalid layout measurements", () => {
    expect(calculateFreshnessLayout(502, 280, 0, 2.88)).toBeNull();
    expect(calculateFreshnessLayout(-1, 280, 160, 2.88)).toBeNull();
    expect(calculateFreshnessLayout(1.5, 280, 160, 2.88)).toBeNull();
  });
});
