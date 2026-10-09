import { describe, expect, test } from "bun:test";
import {
  clearProjectRuntimeChannel,
  publishProjectRuntimeFallback,
  publishProjectRuntimeMetrics,
  readLatestProjectRuntimeMetrics,
} from "../../site/lib/project-runtime-channel";
import { projectRuntimeMetricsBySlug } from "../../site/lib/project-runtime-metrics";

describe("project runtime replay channel", () => {
  test("replays the latest panel model and clears it on fallback", () => {
    const panel = {} as HTMLElement;
    const metrics = projectRuntimeMetricsBySlug["tavily-hikari"];

    publishProjectRuntimeMetrics(panel, metrics);
    expect(readLatestProjectRuntimeMetrics(panel)).toBe(metrics);

    publishProjectRuntimeFallback(panel);
    expect(readLatestProjectRuntimeMetrics(panel)).toBeNull();

    clearProjectRuntimeChannel(panel);
    expect(readLatestProjectRuntimeMetrics(panel)).toBeNull();
  });

  test("replaces an older refresh while inspection is holding a panel", () => {
    const panel = {} as HTMLElement;
    const first = projectRuntimeMetricsBySlug["codex-vibe-monitor"];
    const latest = projectRuntimeMetricsBySlug["octo-rill"];

    publishProjectRuntimeMetrics(panel, first);
    publishProjectRuntimeMetrics(panel, latest);

    expect(readLatestProjectRuntimeMetrics(panel)).toBe(latest);

    publishProjectRuntimeFallback(panel);
    expect(readLatestProjectRuntimeMetrics(panel)).toBeNull();
  });
});
