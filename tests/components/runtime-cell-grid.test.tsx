import { describe, expect, test } from "bun:test";
import {
  buildActivityCells,
  formatExactValue,
  formatRuntimeCellText,
} from "../../site/components/projects/RuntimeCellGrid";

describe("runtime cell grid model", () => {
  test("keeps zero, null and calendar padding distinguishable", () => {
    const { weekCount, cells } = buildActivityCells([
      { date: "2026-07-01", value: 0 },
      { date: "2026-07-02", value: null },
      { date: "2026-07-03", value: 42 },
    ]);

    expect(weekCount).toBe(1);
    expect(cells).toHaveLength(7);
    expect(cells.find((cell) => cell.date === "2026-07-01")?.value).toBe(0);
    expect(cells.find((cell) => cell.date === "2026-07-02")?.value).toBeNull();
    expect(cells.filter((cell) => cell.value === undefined)).toHaveLength(4);
  });

  test("formats complete activity values and anonymous freshness buckets", () => {
    expect(formatExactValue(1_234_567)).toBe("1,234,567");
    expect(
      formatRuntimeCellText("tokens", {
        index: 1,
        date: "2026-07-03",
        value: 1_234_567,
      })
    ).toBe("2026-07-03 · Token 消耗量：1,234,567 Token");
    expect(formatRuntimeCellText("tokens", { index: 2, value: 0 })).toContain("0 Token");
    expect(formatRuntimeCellText("freshness", { index: 3, statusCode: 4 })).toBe("从未成功刷新");
  });
});
