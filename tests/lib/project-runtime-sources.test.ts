import { afterEach, describe, expect, test } from "bun:test";
import { projectRuntimeMetricsBySlug } from "../../site/lib/project-runtime-metrics";
import {
  getProjectRuntimeBaseUrl,
  getProjectRuntimeEndpoint,
  parseProjectRuntimeMetrics,
} from "../../site/lib/project-runtime-sources";

const envNames = [
  "PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL",
  "PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL",
  "PUBLIC_OCTO_RILL_METRICS_BASE_URL",
] as const;

const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  envNames.forEach((name) => {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

function asCvmPayload() {
  const metrics = structuredClone(projectRuntimeMetricsBySlug["codex-vibe-monitor"]);
  return {
    kind: metrics.kind,
    tokensPerMinute: metrics.tokensPerMinute,
    parallelCalls: metrics.parallelCalls,
    todayTokens: metrics.todayTokens,
    tokenActivity90d: {
      status: "partial",
      points: metrics.tokenActivity90d,
    },
  };
}

function asHikariPayload() {
  const metrics = structuredClone(projectRuntimeMetricsBySlug["tavily-hikari"]);
  return {
    todayRequests: metrics.todayRequests,
    todayCredits: metrics.todayCredits,
    monthCredits: metrics.monthCredits,
    totalCredits: metrics.totalCredits,
    requestActivity90d: metrics.requestActivity90d,
  };
}

function asOctoPayload() {
  const metrics = structuredClone(projectRuntimeMetricsBySlug["octo-rill"]);
  return {
    deduplicatedRepositories: {
      value: metrics.deduplicatedRepositories.value,
      trend: metrics.deduplicatedRepositories.trend.points.map((point) => point.value ?? 0),
    },
    pressure: {
      value: metrics.pressure.value,
      trend: metrics.pressure.trend.points.map((point) => point.value ?? 0),
    },
    freshness: Array.from(metrics.freshness),
  };
}

describe("project runtime sources", () => {
  test("keeps all three sources disabled when BaseURLs are empty", () => {
    envNames.forEach((name) => {
      delete process.env[name];
    });

    expect(getProjectRuntimeBaseUrl("codex-vibe-monitor")).toBe("");
    expect(getProjectRuntimeBaseUrl("tavily-hikari")).toBe("");
    expect(getProjectRuntimeBaseUrl("octo-rill")).toBe("");
    expect(getProjectRuntimeEndpoint("codex-vibe-monitor")).toBe("");
    expect(getProjectRuntimeEndpoint("tavily-hikari")).toBe("");
    expect(getProjectRuntimeEndpoint("octo-rill")).toBe("");
  });

  test("normalizes an enabled BaseURL and appends the shared endpoint path", () => {
    process.env.PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL = " https://metrics.example.test/// ";

    expect(getProjectRuntimeBaseUrl("codex-vibe-monitor")).toBe("https://metrics.example.test");
    expect(getProjectRuntimeEndpoint("codex-vibe-monitor")).toBe(
      "https://metrics.example.test/api/public/metrics/v1/codex-vibe-monitor"
    );
  });

  test("adapts the three approved response shapes without reordering data", () => {
    const cvm = parseProjectRuntimeMetrics("codex-vibe-monitor", asCvmPayload());
    const hikari = parseProjectRuntimeMetrics("tavily-hikari", asHikariPayload());
    const octo = parseProjectRuntimeMetrics("octo-rill", asOctoPayload());

    expect(cvm?.kind).toBe("codex-vibe-monitor");
    expect(cvm && "tokenActivity90d" in cvm ? cvm.tokenActivity90d : []).toHaveLength(90);
    expect(hikari?.kind).toBe("tavily-hikari");
    expect(hikari && "requestActivity90d" in hikari ? hikari.requestActivity90d : []).toHaveLength(
      90
    );
    expect(octo?.kind).toBe("octo-rill");
    expect(octo && "freshness" in octo ? Array.from(octo.freshness).slice(0, 8) : []).toEqual(
      Array.from(projectRuntimeMetricsBySlug["octo-rill"].freshness).slice(0, 8)
    );
  });

  test("accepts missing historical CVM values but rejects missing current trend values", () => {
    const payload = asCvmPayload();
    payload.tokenActivity90d.points[0] = {
      date: payload.tokenActivity90d.points[0].date,
      value: null,
    };
    expect(parseProjectRuntimeMetrics("codex-vibe-monitor", payload)).not.toBeNull();

    const currentTrend = payload.tokensPerMinute.trend.points;
    const latestIndex = currentTrend.findLastIndex((point) => point.value !== null);
    currentTrend[latestIndex] = { ...currentTrend[latestIndex], value: null };
    expect(parseProjectRuntimeMetrics("codex-vibe-monitor", payload)).toBeNull();
  });

  test("rejects fields outside the public allowlist", () => {
    expect(
      parseProjectRuntimeMetrics("tavily-hikari", { ...asHikariPayload(), accountId: "private" })
    ).toBeNull();
  });
});
