import { webDemoFetch } from "@/lib/web-demo-fetch";
import {
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_STATE_EVENT,
  type WebDemoActionDetail,
  type WebDemoStateChangeDetail,
} from "../../src/lib/web-demo-runtime";
import {
  clearProjectRuntimeChannel,
  isProjectRuntimeRendered,
  markProjectRuntimeRendered,
  type ProjectRuntimeMetricsUpdatedDetail,
  publishProjectRuntimeFallback,
  publishProjectRuntimeMetrics,
  readLatestProjectRuntimeMetrics,
} from "./project-runtime-channel";
import type { ProjectRuntimeMetrics, RuntimeStat } from "./project-runtime-metrics";
import { createProjectRuntimeMotion } from "./project-runtime-motion";
import {
  getProjectRuntimeRefreshInterval,
  type ProjectRuntimeSlug,
  parseProjectRuntimeMetrics,
} from "./project-runtime-sources";
import { formatRuntimeValue, getRuntimeValueCandidates } from "./runtime-format";
import { calculateFreshnessLayout } from "./runtime-freshness-layout";

const isProjectRuntimeSlug = (value: string): value is ProjectRuntimeSlug =>
  value === "codex-vibe-monitor" || value === "tavily-hikari" || value === "octo-rill";

type MotionGroup = {
  motion: ReturnType<typeof createProjectRuntimeMotion>;
  panels: Set<HTMLElement>;
};
const groups = new WeakMap<HTMLElement, MotionGroup>();
const panelGroups = new WeakMap<HTMLElement, MotionGroup>();

function formatMetricValue(key: string, value: number) {
  return key === "pressure" ? value.toFixed(2) : formatRuntimeValue(value);
}

function metricStats(metrics: ProjectRuntimeMetrics): Record<string, RuntimeStat> {
  if (metrics.kind === "codex-vibe-monitor") {
    return {
      tokensPerMinute: metrics.tokensPerMinute,
      parallelCalls: metrics.parallelCalls,
      todayTokens: metrics.todayTokens,
    };
  }
  if (metrics.kind === "tavily-hikari") {
    return {
      todayRequests: metrics.todayRequests,
      todayCredits: metrics.todayCredits,
      monthCredits: metrics.monthCredits,
      totalCredits: metrics.totalCredits,
    };
  }
  return {
    deduplicatedRepositories: metrics.deduplicatedRepositories,
    pressure: metrics.pressure,
  };
}

function updateMetricElements(panel: HTMLElement, metrics: ProjectRuntimeMetrics) {
  Object.entries(metricStats(metrics)).forEach(([key, stat]) => {
    const metric = panel.querySelector<HTMLElement>(`[data-runtime-stat-key="${key}"]`);
    if (!metric) return;

    const value = metric.querySelector<HTMLElement>("[data-runtime-value]");
    if (value) {
      const fullValue = formatMetricValue(key, stat.value);
      const options = key === "pressure" ? [fullValue] : getRuntimeValueCandidates(stat.value);
      value.dataset.runtimeValueFull = fullValue;
      value.dataset.runtimeValueOptions = JSON.stringify(options);
      value.setAttribute("aria-label", fullValue);
      value.textContent = options[0] ?? fullValue;
    }

    const sparkline = metric.querySelector<HTMLElement>("[data-runtime-sparkline]");
    if (!sparkline) return;
    sparkline.dataset.runtimeTrend = JSON.stringify(stat.trend);
    sparkline.dataset.runtimeRange = stat.trend.range;
    sparkline.dataset.runtimePointCount = String(stat.trend.points.length);
    sparkline.dataset.runtimeFutureCount = String(
      stat.trend.points.filter((point) => point.value === null).length
    );
  });
}

function applyMetrics(panel: HTMLElement, metrics: ProjectRuntimeMetrics) {
  updateMetricElements(panel, metrics);
  delete panel.dataset.runtimeError;
  panel.dataset.runtimeState = "ready";
  publishProjectRuntimeMetrics(panel, metrics);
}

async function refreshPanel(
  panel: HTMLElement,
  controller: AbortController,
  isCurrent: () => boolean = () => true
) {
  if (panel.dataset.runtimeFetching === "true") return;
  const sourceUrl = panel.dataset.runtimeSourceUrl;
  const slug = panel.dataset.runtimeKind;
  if (!sourceUrl || !slug || !isProjectRuntimeSlug(slug)) return;

  panel.dataset.runtimeFetching = "true";
  try {
    const response = await webDemoFetch(sourceUrl, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`runtime metrics request failed: ${response.status}`);
    const payload: unknown = await response.json();
    const metrics = parseProjectRuntimeMetrics(slug, payload);
    if (!metrics) throw new Error("runtime metrics response failed validation");
    if (!isCurrent()) return;
    applyMetrics(panel, metrics);
  } catch (error) {
    if (isCurrent() && !(error instanceof DOMException && error.name === "AbortError")) {
      panel.dataset.runtimeError = "true";
      panel.dataset.runtimeState = "pending";
      publishProjectRuntimeFallback(panel);
      panelGroups.get(panel)?.motion.request(panel, "poster");
    }
  } finally {
    delete panel.dataset.runtimeFetching;
  }
}

function bindPanel(panel: HTMLElement) {
  if (panel.dataset.runtimeLiveBound === "true") return;
  const sourceUrl = panel.dataset.runtimeSourceUrl;
  const slug = panel.dataset.runtimeKind;
  if (!sourceUrl || !slug || !isProjectRuntimeSlug(slug)) return;

  panel.dataset.runtimeLiveBound = "true";
  const controller = new AbortController();
  let timer: number | undefined;
  let refreshRequested = false;
  let refreshRevision = 0;
  let fitFrame: number | undefined;
  let freshnessGrid: HTMLElement | null = null;
  const fitFreshness = () => {
    fitFrame = undefined;
    const metrics = readLatestProjectRuntimeMetrics(panel);
    if (!metrics || !isProjectRuntimeRendered(panel, "grid")) return;
    const freshnessSection = panel.querySelector<HTMLElement>(".runtime-freshness");
    const freshnessTitle = freshnessSection?.querySelector<HTMLElement>(".runtime-chart-title");
    const currentGrid = freshnessSection?.querySelector<HTMLElement>(".runtime-freshness-grid");
    if (!currentGrid || !freshnessSection) {
      markProjectRuntimeRendered(panel, metrics, "layout");
      return;
    }
    freshnessGrid = currentGrid;
    const sectionBounds = freshnessSection.getBoundingClientRect();
    const sectionStyle = getComputedStyle(freshnessSection);
    const titleBounds = freshnessTitle?.getBoundingClientRect();
    const pixelValue = (value: string) => Number.parseFloat(value) || 0;
    const width = Math.max(
      0,
      sectionBounds.width -
        pixelValue(sectionStyle.paddingLeft) -
        pixelValue(sectionStyle.paddingRight) -
        pixelValue(sectionStyle.borderLeftWidth) -
        pixelValue(sectionStyle.borderRightWidth)
    );
    const gap = currentGrid.childElementCount > 0 ? pixelValue(sectionStyle.rowGap) : 0;
    const height = Math.max(
      0,
      sectionBounds.height -
        pixelValue(sectionStyle.paddingTop) -
        pixelValue(sectionStyle.paddingBottom) -
        pixelValue(sectionStyle.borderTopWidth) -
        pixelValue(sectionStyle.borderBottomWidth) -
        (titleBounds?.height ?? 0) -
        gap
    );
    const designGap = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.18;
    const layout = calculateFreshnessLayout(
      currentGrid.querySelectorAll<HTMLElement>(".runtime-freshness-cell").length,
      width,
      height,
      designGap
    );
    if (!layout) return;
    freshnessSection.dataset.runtimeEmpty = layout.rows === 0 ? "true" : "false";
    currentGrid.style.setProperty("--runtime-freshness-columns", String(layout.columns));
    currentGrid.style.setProperty("--runtime-freshness-rows", String(layout.rows));
    currentGrid.style.setProperty("--runtime-freshness-gap", `${layout.gap}px`);
    currentGrid.style.setProperty("--runtime-freshness-cell-size", `${layout.cellSize}px`);
    currentGrid.style.setProperty("--runtime-freshness-grid-height", `${layout.gridHeight}px`);
    currentGrid.dataset.runtimeFreshnessColumns = String(layout.columns);
    currentGrid.dataset.runtimeFreshnessRows = String(layout.rows);
    currentGrid.dispatchEvent(new CustomEvent("runtime-freshness-layout"));
    markProjectRuntimeRendered(panel, metrics, "layout");
  };
  const scheduleFitFreshness = () => {
    if (fitFrame !== undefined) return;
    fitFrame = window.requestAnimationFrame(fitFreshness);
  };
  const onMetricsUpdated = (event: Event) => {
    const detail = (event as CustomEvent<ProjectRuntimeMetricsUpdatedDetail>).detail;
    if (detail?.panel !== panel) return;
    if (detail.metrics && detail.source !== "adapter") applyMetrics(panel, detail.metrics);
    scheduleFitFreshness();
  };
  const onRenderProgress = (event: Event) => {
    const detail = (event as CustomEvent<{ panel: HTMLElement; part: string }>).detail;
    if (detail?.panel !== panel) return;
    if (detail.part === "grid") scheduleFitFreshness();
    if (isProjectRuntimeRendered(panel)) panelGroups.get(panel)?.motion.request(panel, "panel");
  };
  const runRefresh = () => {
    if (controller.signal.aborted) return;
    if (panel.dataset.runtimeFetching === "true") {
      refreshRequested = true;
      return;
    }
    refreshRequested = false;
    const revision = refreshRevision;
    void refreshPanel(panel, controller, () => revision === refreshRevision).finally(() => {
      if (refreshRequested && !controller.signal.aborted) runRefresh();
    });
  };
  const refreshFromDemo = () => {
    refreshRevision += 1;
    refreshRequested = true;
    runRefresh();
  };
  const onDemoAction = (event: Event) => {
    const detail = (event as CustomEvent<WebDemoActionDetail>).detail;
    if (detail?.action === "refresh-data" || detail?.action === "reset-state") refreshFromDemo();
  };
  const onDemoState = (event: Event) => {
    const detail = (event as CustomEvent<WebDemoStateChangeDetail>).detail;
    if (detail?.changed.some((key) => ["data", "connection", "delay"].includes(key))) {
      refreshFromDemo();
    }
  };
  const resizeObserver = new ResizeObserver(scheduleFitFreshness);
  resizeObserver.observe(panel);
  window.addEventListener("project-runtime-metrics-updated", onMetricsUpdated);
  window.addEventListener("project-runtime-render-progress", onRenderProgress);
  window.addEventListener(WEB_DEMO_ACTION_EVENT, onDemoAction);
  window.addEventListener(WEB_DEMO_STATE_EVENT, onDemoState);
  const mutationObserver = new MutationObserver(() => {
    const currentGrid = panel.querySelector<HTMLElement>(".runtime-freshness-grid");
    if (currentGrid && currentGrid !== freshnessGrid) resizeObserver.observe(currentGrid);
    scheduleFitFreshness();
  });
  mutationObserver.observe(panel, { childList: true, subtree: true });
  scheduleFitFreshness();
  const interval = getProjectRuntimeRefreshInterval(slug);
  const stop = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    refreshRevision += 1;
    if (fitFrame !== undefined) window.cancelAnimationFrame(fitFrame);
    fitFrame = undefined;
    controller.abort();
    const group = panelGroups.get(panel);
    group?.motion.unregister(panel);
    group?.panels.delete(panel);
    if (group?.panels.size === 0) {
      group.motion.dispose();
      const root = panel.closest<HTMLElement>(".projects-domain-grid");
      if (root) groups.delete(root);
    }
    panelGroups.delete(panel);
    clearProjectRuntimeChannel(panel);
    delete panel.dataset.runtimeLiveBound;
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    window.removeEventListener("project-runtime-metrics-updated", onMetricsUpdated);
    window.removeEventListener("project-runtime-render-progress", onRenderProgress);
    window.removeEventListener(WEB_DEMO_ACTION_EVENT, onDemoAction);
    window.removeEventListener(WEB_DEMO_STATE_EVENT, onDemoState);
    window.removeEventListener("pagehide", stop);
    document.removeEventListener("astro:before-swap", stop);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    panel.removeEventListener("runtime:stop", stop);
  };
  const start = () => {
    if (document.hidden || controller.signal.aborted || timer !== undefined) return;
    runRefresh();
    timer = window.setInterval(runRefresh, interval);
  };
  const onVisibilityChange = () => {
    if (document.hidden) {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    } else {
      start();
    }
  };

  start();
  panel.addEventListener("runtime:stop", stop, { once: true });
  window.addEventListener("pagehide", stop, { once: true });
  document.addEventListener("astro:before-swap", stop, { once: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
}

export function initializeProjectRuntimeLiveData() {
  const panels = document.querySelectorAll<HTMLElement>("[data-runtime-source-url]");
  panels.forEach((panel) => {
    if (panel.dataset.runtimeLiveBound === "true") return;
    const root = panel.closest<HTMLElement>(".projects-domain-grid");
    if (!root) return;
    let group = groups.get(root);
    if (!group) {
      group = { motion: createProjectRuntimeMotion(root), panels: new Set() };
      groups.set(root, group);
    }
    group.panels.add(panel);
    panelGroups.set(panel, group);
    group.motion.register(panel);
  });
  panels.forEach(bindPanel);
}
