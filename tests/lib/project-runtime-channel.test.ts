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

test("render acknowledgements cannot admit an old revision or fallback", async () => {
  const { Window } = await import("happy-dom");
  const { markProjectRuntimeRendered, isProjectRuntimeRendered, readProjectRuntimeRevision } =
    await import("../../site/lib/project-runtime-channel");
  const browser = new Window();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalEvent = globalThis.CustomEvent;
  Object.assign(globalThis, { window: browser, CustomEvent: browser.CustomEvent });
  try {
    const panel = {} as HTMLElement;
    const metrics = projectRuntimeMetricsBySlug["octo-rill"];
    publishProjectRuntimeMetrics(panel, metrics);
    const stale = readProjectRuntimeRevision(panel);
    publishProjectRuntimeMetrics(panel, metrics);
    markProjectRuntimeRendered(panel, metrics, "grid", stale);
    expect(isProjectRuntimeRendered(panel, "grid")).toBe(false);
    markProjectRuntimeRendered(panel, metrics, "layout");
    markProjectRuntimeRendered(panel, metrics, "sparklines");
    expect(isProjectRuntimeRendered(panel)).toBe(false);
    markProjectRuntimeRendered(panel, metrics, "grid");
    expect(isProjectRuntimeRendered(panel, "grid")).toBe(true);
    expect(isProjectRuntimeRendered(panel)).toBe(true);
    publishProjectRuntimeFallback(panel);
    markProjectRuntimeRendered(panel, metrics, "grid");
    expect(isProjectRuntimeRendered(panel)).toBe(false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    globalThis.CustomEvent = originalEvent;
  }
});
