import type { ProjectRuntimeMetrics } from "./project-runtime-metrics";

const latestMetricsByPanel = new WeakMap<HTMLElement, ProjectRuntimeMetrics>();
const fallbackPanels = new WeakSet<HTMLElement>();
type RuntimeRenderPart = "grid" | "sparklines" | "layout";
const renderedParts = new WeakMap<HTMLElement, Set<RuntimeRenderPart>>();
const revisions = new WeakMap<HTMLElement, number>();

export function readProjectRuntimeRevision(panel: HTMLElement) {
  return revisions.get(panel) ?? 0;
}

export interface ProjectRuntimeMetricsUpdatedDetail {
  panel: HTMLElement;
  metrics: ProjectRuntimeMetrics;
  source?: "adapter";
}

export function publishProjectRuntimeMetrics(panel: HTMLElement, metrics: ProjectRuntimeMetrics) {
  latestMetricsByPanel.set(panel, metrics);
  revisions.set(panel, readProjectRuntimeRevision(panel) + 1);
  renderedParts.set(panel, new Set());
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
  revisions.set(panel, readProjectRuntimeRevision(panel) + 1);
  latestMetricsByPanel.delete(panel);
  fallbackPanels.add(panel);
  renderedParts.delete(panel);
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
  revisions.set(panel, readProjectRuntimeRevision(panel) + 1);
  latestMetricsByPanel.delete(panel);
  fallbackPanels.delete(panel);
  renderedParts.delete(panel);
}

export function markProjectRuntimeRendered(
  panel: HTMLElement,
  metrics: ProjectRuntimeMetrics,
  part: RuntimeRenderPart,
  revision = readProjectRuntimeRevision(panel)
) {
  if (
    readLatestProjectRuntimeMetrics(panel) !== metrics ||
    revision !== readProjectRuntimeRevision(panel)
  )
    return;
  const parts = renderedParts.get(panel);
  if (!parts || parts.has(part)) return;
  parts.add(part);
  window.dispatchEvent(
    new CustomEvent("project-runtime-render-progress", { detail: { panel, metrics, part } })
  );
}

export function isProjectRuntimeRendered(panel: HTMLElement, part?: RuntimeRenderPart) {
  const parts = renderedParts.get(panel);
  return part ? parts?.has(part) === true : parts?.size === 3;
}
