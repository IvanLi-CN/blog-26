import type { ProjectRuntimeMetrics } from "./project-runtime-metrics";

const latestMetricsByPanel = new WeakMap<HTMLElement, ProjectRuntimeMetrics>();
const fallbackPanels = new WeakSet<HTMLElement>();

export interface ProjectRuntimeMetricsUpdatedDetail {
  panel: HTMLElement;
  metrics: ProjectRuntimeMetrics;
  source?: "adapter";
}

export function publishProjectRuntimeMetrics(panel: HTMLElement, metrics: ProjectRuntimeMetrics) {
  latestMetricsByPanel.set(panel, metrics);
  fallbackPanels.delete(panel);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ProjectRuntimeMetricsUpdatedDetail>("project-runtime-metrics-updated", {
        detail: { panel, metrics, source: "adapter" },
      })
    );
  }
}

export function publishProjectRuntimeFallback(panel: HTMLElement) {
  latestMetricsByPanel.delete(panel);
  fallbackPanels.add(panel);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("project-runtime-metrics-fallback", { detail: { panel } })
    );
  }
}

export function readLatestProjectRuntimeMetrics(panel: HTMLElement) {
  if (fallbackPanels.has(panel)) return null;
  return latestMetricsByPanel.get(panel) ?? null;
}

export function clearProjectRuntimeChannel(panel: HTMLElement) {
  latestMetricsByPanel.delete(panel);
  fallbackPanels.delete(panel);
}
