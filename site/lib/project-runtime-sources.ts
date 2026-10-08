import type {
  ProjectRuntimeMetrics,
  RuntimeActivityPoint,
  RuntimeStat,
  RuntimeTrend,
  RuntimeTrendPoint,
} from "./project-runtime-metrics";

export type ProjectRuntimeSlug = "codex-vibe-monitor" | "tavily-hikari" | "octo-rill";

const TRAILING_SLASHES = /\/+$/;

export const projectRuntimeEndpointPaths: Record<ProjectRuntimeSlug, string> = {
  "codex-vibe-monitor": "/api/public/metrics/v1/codex-vibe-monitor",
  "tavily-hikari": "/api/public/metrics/v1/tavily-hikari",
  "octo-rill": "/api/public/metrics/v1/octo-rill",
};

const projectRuntimeBaseUrlEnv: Record<ProjectRuntimeSlug, string> = {
  "codex-vibe-monitor": "PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL",
  "tavily-hikari": "PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL",
  "octo-rill": "PUBLIC_OCTO_RILL_METRICS_BASE_URL",
};

const projectRuntimeRefreshIntervals: Record<ProjectRuntimeSlug, number> = {
  "codex-vibe-monitor": 30_000,
  "tavily-hikari": 30_000,
  "octo-rill": 300_000,
};

function readPublicEnv(name: string) {
  const importMetaEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      : undefined;
  const fromImportMeta = importMetaEnv?.[name];
  if (typeof fromImportMeta === "string") return fromImportMeta;

  const fromProcess =
    typeof process !== "undefined" && process.env
      ? process.env[name as keyof typeof process.env]
      : undefined;
  return typeof fromProcess === "string" ? fromProcess : "";
}

export function getProjectRuntimeBaseUrl(slug: string): string {
  if (!(slug in projectRuntimeBaseUrlEnv)) return "";
  const envName = projectRuntimeBaseUrlEnv[slug as ProjectRuntimeSlug];
  return readPublicEnv(envName).trim().replace(TRAILING_SLASHES, "");
}

export function getProjectRuntimeEndpoint(slug: string): string {
  if (!(slug in projectRuntimeEndpointPaths)) return "";
  const projectSlug = slug as ProjectRuntimeSlug;
  const baseUrl = getProjectRuntimeBaseUrl(projectSlug);
  return baseUrl ? `${baseUrl}${projectRuntimeEndpointPaths[projectSlug]}` : "";
}

export function getProjectRuntimeRefreshInterval(slug: string): number {
  return projectRuntimeRefreshIntervals[slug as ProjectRuntimeSlug] ?? 60_000;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]) {
  return Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseTrendPoint(value: unknown): RuntimeTrendPoint | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["timestamp", "value"]) ||
    !isTimestamp(value.timestamp)
  ) {
    return null;
  }
  if (value.value !== null && !isNonNegativeNumber(value.value)) return null;
  return { timestamp: value.timestamp, value: value.value };
}

function parseTrend(value: unknown): RuntimeTrend | null {
  if (Array.isArray(value)) {
    if (value.length < 1 || value.length > 12 || !value.every(isNonNegativeNumber)) return null;
    const end = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    return {
      range: "recent-hours",
      points: value.map((point, index) => ({
        timestamp: new Date(end - (value.length - index - 1) * 3_600_000).toISOString(),
        value: point,
      })),
    };
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["range", "points"]) ||
    !Array.isArray(value.points)
  ) {
    return null;
  }
  if (value.range !== "recent-hours" && value.range !== "today") return null;
  const expectedLength = value.range === "today" ? 25 : 12;
  if (value.points.length !== expectedLength) return null;
  const points = value.points.map(parseTrendPoint);
  if (points.some((point): point is null => point === null)) return null;
  const parsedPoints = points as RuntimeTrendPoint[];
  const timestamps = parsedPoints.map((point) => Date.parse(point.timestamp));
  if (
    !timestamps.every((timestamp, index) => {
      const previousTimestamp = timestamps[index - 1];
      return index === 0 || (previousTimestamp !== undefined && timestamp >= previousTimestamp);
    })
  ) {
    return null;
  }
  if (value.range === "today") {
    const first = parsedPoints[0]?.timestamp;
    const last = parsedPoints.at(-1)?.timestamp;
    if (!first?.includes("T00:00:00") || !last?.includes("T00:00:00")) return null;
    const nullIndexes = parsedPoints
      .map((point, index) => (point.value === null ? index : -1))
      .filter((index) => index >= 0);
    const firstNullIndex = nullIndexes[0];
    if (
      firstNullIndex !== undefined &&
      nullIndexes.some((index, position) => index !== firstNullIndex + position)
    ) {
      return null;
    }
  } else if (parsedPoints.some((point) => point.value === null)) {
    return null;
  }
  return { range: value.range, points: parsedPoints };
}

function parseStat(value: unknown): RuntimeStat | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["value", "trend"]) ||
    !isNonNegativeNumber(value.value)
  ) {
    return null;
  }
  const trend = parseTrend(value.trend);
  if (!trend) return null;
  const latestValue = [...trend.points].reverse().find((point) => point.value !== null)?.value;
  return latestValue === value.value ? { value: value.value, trend } : null;
}

function parseActivityPoints(value: unknown, allowNull: boolean): RuntimeActivityPoint[] | null {
  if (!Array.isArray(value) || value.length !== 90) return null;
  const points = value.map((point): RuntimeActivityPoint | null => {
    if (!isRecord(point) || !hasExactKeys(point, ["date", "value"]) || !isDate(point.date))
      return null;
    if (point.value === null && allowNull) return { date: point.date, value: null };
    if (!isNonNegativeNumber(point.value)) return null;
    return { date: point.date, value: point.value };
  });
  if (points.some((point): point is null => point === null)) return null;
  const parsedPoints = points as RuntimeActivityPoint[];
  const dates = parsedPoints.map((point) => point.date);
  if (new Set(dates).size !== dates.length) return null;
  if (
    !dates.every((date, index) => {
      const previousDate = dates[index - 1];
      return index === 0 || (previousDate !== undefined && date >= previousDate);
    })
  ) {
    return null;
  }
  return parsedPoints;
}

function parseCvmActivity(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["status", "points"])) return null;
  if (
    value.status !== "available" &&
    value.status !== "partial" &&
    value.status !== "unavailable"
  ) {
    return null;
  }
  return parseActivityPoints(value.points, true);
}

function parseCvm(payload: JsonRecord): ProjectRuntimeMetrics | null {
  if (
    !hasExactKeys(payload, [
      "kind",
      "tokensPerMinute",
      "parallelCalls",
      "todayTokens",
      "tokenActivity90d",
    ]) ||
    payload.kind !== "codex-vibe-monitor"
  ) {
    return null;
  }
  const tokensPerMinute = parseStat(payload.tokensPerMinute);
  const parallelCalls = parseStat(payload.parallelCalls);
  const todayTokens = parseStat(payload.todayTokens);
  const tokenActivity90d = parseCvmActivity(payload.tokenActivity90d);
  if (!tokensPerMinute || !parallelCalls || !todayTokens || !tokenActivity90d) return null;
  return {
    kind: "codex-vibe-monitor",
    tokensPerMinute,
    parallelCalls,
    todayTokens,
    tokenActivity90d,
  };
}

function parseHikari(payload: JsonRecord): ProjectRuntimeMetrics | null {
  if (
    !hasExactKeys(payload, [
      "todayRequests",
      "todayCredits",
      "monthCredits",
      "totalCredits",
      "requestActivity90d",
    ])
  ) {
    return null;
  }
  const todayRequests = parseStat(payload.todayRequests);
  const todayCredits = parseStat(payload.todayCredits);
  const monthCredits = parseStat(payload.monthCredits);
  const totalCredits = parseStat(payload.totalCredits);
  const requestActivity90d = parseActivityPoints(payload.requestActivity90d, false);
  if (!todayRequests || !todayCredits || !monthCredits || !totalCredits || !requestActivity90d)
    return null;
  return {
    kind: "tavily-hikari",
    todayRequests,
    todayCredits,
    monthCredits,
    totalCredits,
    requestActivity90d,
  };
}

function parseOcto(payload: JsonRecord): ProjectRuntimeMetrics | null {
  if (!hasExactKeys(payload, ["deduplicatedRepositories", "pressure", "freshness"])) return null;
  const deduplicatedRepositories = parseStat(payload.deduplicatedRepositories);
  const pressure = parseStat(payload.pressure);
  if (!deduplicatedRepositories || !pressure || !Array.isArray(payload.freshness)) return null;
  if (
    payload.freshness.length !== deduplicatedRepositories.value ||
    !payload.freshness.every(
      (statusCode): statusCode is number =>
        Number.isInteger(statusCode) && statusCode >= 0 && statusCode <= 4
    )
  ) {
    return null;
  }
  return {
    kind: "octo-rill",
    deduplicatedRepositories,
    pressure,
    freshness: Uint8Array.from(payload.freshness),
  };
}

export function parseProjectRuntimeMetrics(
  slug: ProjectRuntimeSlug,
  payload: unknown
): ProjectRuntimeMetrics | null {
  if (!isRecord(payload)) return null;
  if (slug === "codex-vibe-monitor") return parseCvm(payload);
  if (slug === "tavily-hikari") return parseHikari(payload);
  return parseOcto(payload);
}
