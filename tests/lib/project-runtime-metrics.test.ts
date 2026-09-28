import { describe, expect, test } from "bun:test";
import {
  projectRuntimeMetricsBySlug,
  type RuntimeStat,
} from "../../site/lib/project-runtime-metrics";

const pointKeys = ["date", "value"];

function assertDailyActivity(points: Array<{ date: string; value: number }>) {
  expect(points).toHaveLength(90);
  expect(points.map((point) => Object.keys(point))).toEqual(
    Array.from({ length: points.length }, () => pointKeys)
  );
  expect(points.map((point) => point.date)).toEqual([...points].map((point) => point.date).sort());
  expect(new Set(points.map((point) => point.date)).size).toBe(90);
  expect(points.every((point) => point.value >= 0)).toBe(true);
}

function assertStat(stat: RuntimeStat) {
  expect(Object.keys(stat)).toEqual(["value", "trend"]);
  expect(stat.value).toBeGreaterThanOrEqual(0);
  expect(stat.trend.points.length).toBe(stat.trend.range === "today" ? 25 : 12);

  const timestamps = stat.trend.points.map((point) => Date.parse(point.timestamp));
  expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
  expect(stat.trend.points.every((point) => point.value === null || point.value >= 0)).toBe(true);
  expect([...stat.trend.points].reverse().find((point) => point.value !== null)?.value).toBe(
    stat.value
  );

  const nullIndexes = stat.trend.points
    .map((point, index) => (point.value === null ? index : -1))
    .filter((index) => index >= 0);
  if (stat.trend.range === "today") {
    expect(stat.trend.points[0]?.timestamp).toContain("T00:00:00");
    expect(stat.trend.points.at(-1)?.timestamp).toContain("T00:00:00");
    expect(nullIndexes.length).toBeGreaterThan(0);
    expect(nullIndexes).toEqual(
      Array.from({ length: nullIndexes.length }, (_, index) => nullIndexes[0] + index)
    );
  } else {
    expect(nullIndexes).toHaveLength(0);
  }
}

describe("project runtime metrics mock", () => {
  test("keeps the CVM whitelist and 90 daily token points", () => {
    const metrics = projectRuntimeMetricsBySlug["codex-vibe-monitor"];

    expect(Object.keys(metrics).sort()).toEqual([
      "kind",
      "parallelCalls",
      "todayTokens",
      "tokenActivity90d",
      "tokensPerMinute",
    ]);
    assertStat(metrics.tokensPerMinute);
    assertStat(metrics.parallelCalls);
    assertStat(metrics.todayTokens);
    assertDailyActivity(metrics.tokenActivity90d);
  });

  test("keeps the Hikari whitelist and 90 daily request points", () => {
    const metrics = projectRuntimeMetricsBySlug["tavily-hikari"];

    expect(Object.keys(metrics).sort()).toEqual([
      "kind",
      "monthCredits",
      "requestActivity90d",
      "todayCredits",
      "todayRequests",
      "totalCredits",
    ]);
    assertStat(metrics.todayRequests);
    assertStat(metrics.todayCredits);
    assertStat(metrics.monthCredits);
    assertStat(metrics.totalCredits);
    assertDailyActivity(metrics.requestActivity90d);
  });

  test("keeps OctoRill freshness in the interface-provided u8 order", () => {
    const metrics = projectRuntimeMetricsBySlug["octo-rill"];

    expect(Object.keys(metrics).sort()).toEqual([
      "deduplicatedRepositories",
      "freshness",
      "kind",
      "pressure",
    ]);
    assertStat(metrics.deduplicatedRepositories);
    assertStat(metrics.pressure);
    expect(metrics.freshness).toBeInstanceOf(Uint8Array);
    expect(metrics.freshness).toHaveLength(metrics.deduplicatedRepositories.value);
    expect(Array.from(metrics.freshness).every((statusCode) => statusCode <= 4)).toBe(true);
    expect(Array.from(metrics.freshness).slice(0, 8)).toEqual([0, 1, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(metrics.freshness).slice(-8)).toEqual([1, 0, 2, 1, 0, 0, 0, 0]);
    expect(new Set(metrics.freshness)).toEqual(new Set([0, 1, 2]));
  });
});
