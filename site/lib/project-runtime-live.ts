import type {
  ProjectRuntimeMetrics,
  RuntimeActivityPoint,
  RuntimeStat,
} from "./project-runtime-metrics";
import {
  getProjectRuntimeRefreshInterval,
  type ProjectRuntimeSlug,
  parseProjectRuntimeMetrics,
} from "./project-runtime-sources";
import { formatRuntimeValue, getRuntimeValueCandidates } from "./runtime-format";

const freshnessStatusClasses = [
  "within-4-hours",
  "4-to-12-hours",
  "12-to-24-hours",
  "over-24-hours",
  "no-success",
] as const;

const isProjectRuntimeSlug = (value: string): value is ProjectRuntimeSlug =>
  value === "codex-vibe-monitor" || value === "tavily-hikari" || value === "octo-rill";

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

function parseUtcDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatUtcDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function createActivityCell(
  cell: { date: string; value: number | null } | undefined,
  week: number,
  weekday: number,
  maxValue: number,
  valueLabel: string
) {
  const element = document.createElement("span");
  element.style.setProperty("--runtime-week", String(week));
  element.style.setProperty("--runtime-weekday", String(weekday));

  if (!cell || cell.value === null) {
    element.className = "runtime-activity-slot runtime-activity-slot--empty";
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  element.className = "runtime-activity-cell";
  element.dataset.runtimePoint = "";
  element.dataset.date = cell.date;
  element.dataset.value = formatRuntimeValue(cell.value);
  element.dataset.label = valueLabel;
  element.style.setProperty("--runtime-intensity", String(Math.min(cell.value / maxValue, 1)));
  element.setAttribute("role", "img");
  element.tabIndex = 0;
  element.setAttribute(
    "aria-label",
    `${cell.date} ${valueLabel} ${formatRuntimeValue(cell.value)}`
  );
  return element;
}

function updateActivityChart(
  chart: HTMLElement,
  points: RuntimeActivityPoint[],
  valueLabel: string
) {
  const validPoints = points.filter((point) => point.date);
  const firstTimestamp = parseUtcDate(validPoints[0]?.date ?? "1970-01-01");
  const lastTimestamp = parseUtcDate(
    validPoints.at(-1)?.date ?? validPoints[0]?.date ?? "1970-01-01"
  );
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const calendarStart = firstTimestamp - new Date(firstTimestamp).getUTCDay() * dayMilliseconds;
  const calendarEnd = lastTimestamp + (6 - new Date(lastTimestamp).getUTCDay()) * dayMilliseconds;
  const weekCount = Math.floor((calendarEnd - calendarStart) / (7 * dayMilliseconds)) + 1;
  const pointsByDate = new Map(points.map((point) => [point.date, point]));
  const maxValue = Math.max(
    ...points.flatMap((point) => (point.value === null ? [] : [point.value])),
    1
  );
  const grid = chart.querySelector<HTMLElement>(".runtime-activity-grid");
  const tooltip = chart.querySelector<HTMLElement>("[data-runtime-tooltip]");
  if (!grid) return;

  const cells = Array.from({ length: weekCount * 7 }, (_, index) => {
    const timestamp = calendarStart + index * dayMilliseconds;
    const date = formatUtcDate(timestamp);
    return createActivityCell(
      pointsByDate.get(date),
      Math.floor(index / 7) + 1,
      (index % 7) + 1,
      maxValue,
      valueLabel
    );
  });
  grid.replaceChildren(...cells);
  grid.dataset.weekCount = String(weekCount);
  grid.style.setProperty("--runtime-week-count", String(weekCount));
  if (tooltip) {
    tooltip.hidden = true;
    tooltip.textContent = "";
  }
}

function updateFreshness(panel: HTMLElement, freshness: Uint8Array, repositoryCount: number) {
  const grid = panel.querySelector<HTMLElement>(".runtime-freshness-grid");
  if (!grid) return;
  grid.replaceChildren(
    ...Array.from(freshness, (statusCode) => {
      const cell = document.createElement("span");
      cell.className = `runtime-freshness-cell runtime-freshness-cell--${freshnessStatusClasses[statusCode] ?? "unknown"}`;
      cell.dataset.statusCode = String(statusCode);
      cell.setAttribute("aria-hidden", "true");
      return cell;
    })
  );
  grid.setAttribute(
    "aria-label",
    `仓库刷新新鲜度热点图，共 ${formatRuntimeValue(repositoryCount)} 个仓库`
  );
}

function applyMetrics(panel: HTMLElement, metrics: ProjectRuntimeMetrics) {
  updateMetricElements(panel, metrics);
  if (metrics.kind === "codex-vibe-monitor") {
    const chart = panel.querySelector<HTMLElement>('[data-runtime-chart][aria-label*="Token"]');
    if (chart) updateActivityChart(chart, metrics.tokenActivity90d, "Token");
  } else if (metrics.kind === "tavily-hikari") {
    const chart = panel.querySelector<HTMLElement>('[data-runtime-chart][aria-label*="请求"]');
    if (chart) updateActivityChart(chart, metrics.requestActivity90d, "请求");
  } else {
    updateFreshness(panel, metrics.freshness, metrics.deduplicatedRepositories.value);
  }

  panel.dataset.runtimeState = "ready";
  panel
    .closest<HTMLElement>(".projects-poster-visual")
    ?.querySelector<HTMLElement>("[data-runtime-fallback-poster]")
    ?.setAttribute("hidden", "");
  window.dispatchEvent(new CustomEvent("project-runtime-metrics-updated", { detail: { panel } }));
}

async function refreshPanel(panel: HTMLElement, controller: AbortController) {
  if (panel.dataset.runtimeFetching === "true") return;
  const sourceUrl = panel.dataset.runtimeSourceUrl;
  const slug = panel.dataset.runtimeKind;
  if (!sourceUrl || !slug || !isProjectRuntimeSlug(slug)) return;

  panel.dataset.runtimeFetching = "true";
  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`runtime metrics request failed: ${response.status}`);
    const payload: unknown = await response.json();
    const metrics = parseProjectRuntimeMetrics(slug, payload);
    if (!metrics) throw new Error("runtime metrics response failed validation");
    applyMetrics(panel, metrics);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      panel.dataset.runtimeError = "true";
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
  const interval = getProjectRuntimeRefreshInterval(slug);
  const stop = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    controller.abort();
  };
  const start = () => {
    if (document.hidden || controller.signal.aborted) return;
    void refreshPanel(panel, controller);
    timer = window.setInterval(() => void refreshPanel(panel, controller), interval);
  };

  start();
  panel.addEventListener("runtime:stop", stop, { once: true });
  window.addEventListener("pagehide", stop, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    } else {
      start();
    }
  });
}

export function initializeProjectRuntimeLiveData() {
  document.querySelectorAll<HTMLElement>("[data-runtime-source-url]").forEach(bindPanel);
}
