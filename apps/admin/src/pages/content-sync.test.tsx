import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { VectorizationStatsGrid } from "./content-sync";

GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

describe("VectorizationStatsGrid", () => {
  test("renders readable vectorization metrics instead of raw response data", () => {
    const { getByTestId, getByText } = render(
      <VectorizationStatsGrid
        stats={{
          indexed: 12,
          outdated: 3,
          unindexed: 4,
          lastIndexedAt: "2026-09-27T04:00:00.000Z",
          model: "BAAI/bge-m3",
          dim: 1024,
        }}
      />
    );

    expect(getByTestId("vectorization-stats")).toBeTruthy();
    expect(getByText("已索引")).toBeTruthy();
    expect(getByText("待处理")).toBeTruthy();
    expect(getByText("需更新")).toBeTruthy();
    expect(getByText("最近更新")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
    expect(getByText("4")).toBeTruthy();
    expect(getByText(/2026/)).toBeTruthy();
  });
});
