export interface RuntimeActivityPoint {
  date: string;
  value: number | null;
}

export type RuntimeTrendRange = "recent-hours" | "today";

export interface RuntimeTrendPoint {
  timestamp: string;
  value: number | null;
}

export interface RuntimeTrend {
  range: RuntimeTrendRange;
  points: RuntimeTrendPoint[];
}

export interface RuntimeStat {
  value: number;
  trend: RuntimeTrend;
}

export interface CodexVibeMonitorRuntimeMetrics {
  kind: "codex-vibe-monitor";
  tokensPerMinute: RuntimeStat;
  parallelCalls: RuntimeStat;
  todayTokens: RuntimeStat;
  tokenActivity90d: RuntimeActivityPoint[];
}

export interface TavilyHikariRuntimeMetrics {
  kind: "tavily-hikari";
  todayRequests: RuntimeStat;
  todayCredits: RuntimeStat;
  monthCredits: RuntimeStat;
  totalCredits: RuntimeStat;
  requestActivity90d: RuntimeActivityPoint[];
}

export interface OctoRillRuntimeMetrics {
  kind: "octo-rill";
  deduplicatedRepositories: RuntimeStat;
  pressure: RuntimeStat;
  freshness: Uint8Array;
}

export type ProjectRuntimeMetrics =
  | CodexVibeMonitorRuntimeMetrics
  | TavilyHikariRuntimeMetrics
  | OctoRillRuntimeMetrics;

const makeTrendTimestamp = (hour: number) => {
  const isNextDay = hour === 24;
  const date = isNextDay ? "2026-09-28" : "2026-09-27";
  const clockHour = isNextDay ? 0 : hour;
  return `${date}T${String(clockHour).padStart(2, "0")}:00:00+08:00`;
};

const createTrend = (
  range: RuntimeTrendRange,
  values: Array<number | null>,
  startHour = range === "today" ? 0 : 6
): RuntimeTrend => ({
  range,
  points: values.map((value, index) => ({
    timestamp: makeTrendTimestamp(startHour + index),
    value,
  })),
});

const zeroTokenActivity = [
  "2026-06-30",
  "2026-07-01",
  "2026-07-02",
  "2026-07-03",
  "2026-07-04",
  "2026-07-05",
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
  "2026-07-11",
  "2026-07-12",
  "2026-07-13",
  "2026-07-14",
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19",
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-08",
  "2026-08-09",
  "2026-08-10",
].map((date) => ({ date, value: 0 }));

const tokenActivity90d: RuntimeActivityPoint[] = [
  ...zeroTokenActivity,
  { date: "2026-08-11", value: 1721889172 },
  { date: "2026-08-12", value: 3697700618 },
  { date: "2026-08-13", value: 2183298933 },
  { date: "2026-08-14", value: 3407672650 },
  { date: "2026-08-15", value: 4173472134 },
  { date: "2026-08-16", value: 4595140752 },
  { date: "2026-08-17", value: 4771289897 },
  { date: "2026-08-18", value: 3469741103 },
  { date: "2026-08-19", value: 5500519045 },
  { date: "2026-08-20", value: 3851591220 },
  { date: "2026-08-21", value: 3863582424 },
  { date: "2026-08-22", value: 1236538391 },
  { date: "2026-08-23", value: 2081759395 },
  { date: "2026-08-24", value: 2311244756 },
  { date: "2026-08-25", value: 1660998200 },
  { date: "2026-08-26", value: 1756453274 },
  { date: "2026-08-27", value: 4673711318 },
  { date: "2026-08-28", value: 1347466328 },
  { date: "2026-08-29", value: 2949668747 },
  { date: "2026-08-30", value: 2977358204 },
  { date: "2026-08-31", value: 1615896704 },
  { date: "2026-09-01", value: 3117612768 },
  { date: "2026-09-02", value: 3224125557 },
  { date: "2026-09-03", value: 2724935282 },
  { date: "2026-09-04", value: 2645167006 },
  { date: "2026-09-05", value: 3098470164 },
  { date: "2026-09-06", value: 2560384080 },
  { date: "2026-09-07", value: 2295825832 },
  { date: "2026-09-08", value: 2629536492 },
  { date: "2026-09-09", value: 3041981967 },
  { date: "2026-09-10", value: 4822945960 },
  { date: "2026-09-11", value: 4873610744 },
  { date: "2026-09-12", value: 3067226911 },
  { date: "2026-09-13", value: 5129466021 },
  { date: "2026-09-14", value: 3647735038 },
  { date: "2026-09-15", value: 4614909482 },
  { date: "2026-09-16", value: 4234868095 },
  { date: "2026-09-17", value: 5078878516 },
  { date: "2026-09-18", value: 4433814447 },
  { date: "2026-09-19", value: 5163069496 },
  { date: "2026-09-20", value: 3277910035 },
  { date: "2026-09-21", value: 3451854784 },
  { date: "2026-09-22", value: 4895292228 },
  { date: "2026-09-23", value: 4743001623 },
  { date: "2026-09-24", value: 3820654466 },
  { date: "2026-09-25", value: 4342983119 },
  { date: "2026-09-26", value: 3002068322 },
  { date: "2026-09-27", value: 2120666094 },
];

const requestActivity90d: RuntimeActivityPoint[] = [
  { date: "2026-06-30", value: 1 },
  { date: "2026-07-01", value: 0 },
  { date: "2026-07-02", value: 0 },
  { date: "2026-07-03", value: 0 },
  { date: "2026-07-04", value: 0 },
  { date: "2026-07-05", value: 0 },
  { date: "2026-07-06", value: 0 },
  { date: "2026-07-07", value: 27 },
  { date: "2026-07-08", value: 0 },
  { date: "2026-07-09", value: 15 },
  { date: "2026-07-10", value: 5 },
  { date: "2026-07-11", value: 0 },
  { date: "2026-07-12", value: 0 },
  { date: "2026-07-13", value: 11 },
  { date: "2026-07-14", value: 38 },
  { date: "2026-07-15", value: 2 },
  { date: "2026-07-16", value: 0 },
  { date: "2026-07-17", value: 2 },
  { date: "2026-07-18", value: 0 },
  { date: "2026-07-19", value: 0 },
  { date: "2026-07-20", value: 2 },
  { date: "2026-07-21", value: 1 },
  { date: "2026-07-22", value: 20 },
  { date: "2026-07-23", value: 3 },
  { date: "2026-07-24", value: 0 },
  { date: "2026-07-25", value: 42 },
  { date: "2026-07-26", value: 22 },
  { date: "2026-07-27", value: 9 },
  { date: "2026-07-28", value: 3 },
  { date: "2026-07-29", value: 7 },
  { date: "2026-07-30", value: 11 },
  { date: "2026-07-31", value: 41 },
  { date: "2026-08-01", value: 2 },
  { date: "2026-08-02", value: 4 },
  { date: "2026-08-03", value: 54 },
  { date: "2026-08-04", value: 80 },
  { date: "2026-08-05", value: 8 },
  { date: "2026-08-06", value: 2 },
  { date: "2026-08-07", value: 0 },
  { date: "2026-08-08", value: 1 },
  { date: "2026-08-09", value: 0 },
  { date: "2026-08-10", value: 9 },
  { date: "2026-08-11", value: 32 },
  { date: "2026-08-12", value: 0 },
  { date: "2026-08-13", value: 0 },
  { date: "2026-08-14", value: 30 },
  { date: "2026-08-15", value: 119 },
  { date: "2026-08-16", value: 0 },
  { date: "2026-08-17", value: 5 },
  { date: "2026-08-18", value: 0 },
  { date: "2026-08-19", value: 3 },
  { date: "2026-08-20", value: 0 },
  { date: "2026-08-21", value: 0 },
  { date: "2026-08-22", value: 1 },
  { date: "2026-08-23", value: 0 },
  { date: "2026-08-24", value: 2 },
  { date: "2026-08-25", value: 2 },
  { date: "2026-08-26", value: 0 },
  { date: "2026-08-27", value: 0 },
  { date: "2026-08-28", value: 0 },
  { date: "2026-08-29", value: 0 },
  { date: "2026-08-30", value: 13 },
  { date: "2026-08-31", value: 16 },
  { date: "2026-09-01", value: 10 },
  { date: "2026-09-02", value: 3 },
  { date: "2026-09-03", value: 4 },
  { date: "2026-09-04", value: 0 },
  { date: "2026-09-05", value: 1 },
  { date: "2026-09-06", value: 4 },
  { date: "2026-09-07", value: 0 },
  { date: "2026-09-08", value: 5 },
  { date: "2026-09-09", value: 3 },
  { date: "2026-09-10", value: 0 },
  { date: "2026-09-11", value: 23 },
  { date: "2026-09-12", value: 80 },
  { date: "2026-09-13", value: 0 },
  { date: "2026-09-14", value: 3 },
  { date: "2026-09-15", value: 35 },
  { date: "2026-09-16", value: 20 },
  { date: "2026-09-17", value: 518 },
  { date: "2026-09-18", value: 16 },
  { date: "2026-09-19", value: 0 },
  { date: "2026-09-20", value: 0 },
  { date: "2026-09-21", value: 16 },
  { date: "2026-09-22", value: 14 },
  { date: "2026-09-23", value: 12 },
  { date: "2026-09-24", value: 29 },
  { date: "2026-09-25", value: 0 },
  { date: "2026-09-26", value: 0 },
  { date: "2026-09-27", value: 0 },
];

const cvmTokensPerMinuteTrend = createTrend(
  "recent-hours",
  [693420, 745880, 681240, 758910, 812640, 774320, 708540, 836770, 791420, 868350, 824980, 793758]
);
const cvmParallelCallsTrend = createTrend("recent-hours", [1, 3, 2, 5, 4, 6, 3, 2, 4, 1, 2, 0]);
const cvmTodayTokensTrend = createTrend("today", [
  28000000,
  104000000,
  155000000,
  232000000,
  301000000,
  356000000,
  451000000,
  520000000,
  601000000,
  690000000,
  785000000,
  921000000,
  1002000000,
  1120000000,
  1286000000,
  1498000000,
  2110898841,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]);

const hikariTodayRequestsTrend = createTrend("today", [
  1,
  0,
  3,
  2,
  4,
  1,
  5,
  2,
  7,
  4,
  3,
  6,
  5,
  2,
  4,
  1,
  0,
  ...Array.from({ length: 8 }, () => null),
]);
const hikariTodayCreditsTrend = createTrend("today", [
  0,
  1,
  0,
  2,
  1,
  3,
  2,
  4,
  3,
  1,
  4,
  2,
  5,
  4,
  2,
  3,
  0,
  ...Array.from({ length: 8 }, () => null),
]);
const hikariMonthCreditsTrend = createTrend(
  "recent-hours",
  [612, 738, 824, 930, 1012, 1094, 1181, 1267, 1328, 1414, 1492, 1587]
);
const hikariTotalCreditsTrend = createTrend(
  "recent-hours",
  [13200, 13800, 14300, 15100, 15800, 16400, 17100, 17600, 18300, 19100, 20100, 21000]
);

const octoRepositoryTrend = createTrend(
  "recent-hours",
  [497, 497, 498, 498, 497, 499, 499, 500, 498, 500, 501, 501]
);
const octoPressureTrend = createTrend(
  "recent-hours",
  [6.42, 6.78, 6.61, 7.04, 6.88, 7.34, 7.12, 7.58, 7.21, 7.76, 7.39, 7.51]
);

// De-identified interface-shaped status bytes; array order is the display order.
const octoFreshnessU8 = Uint8Array.from([
  0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 2, 0, 1, 0, 1, 1, 1, 0, 2, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 2, 1, 0, 1,
  1, 0, 0, 0, 2, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 2, 0, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 0,
  1, 2, 1, 0, 1, 0, 1, 1, 0, 0, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 2, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 2, 2,
  1, 1, 0, 0, 0, 1, 2, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 2, 1, 0, 1, 1, 0, 0, 1, 1,
  1, 0, 0, 2, 0, 2, 2, 1, 1, 1, 0, 1, 2, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 0, 2, 2, 0, 0, 1, 1, 1, 0, 1, 2, 2, 1, 0, 1, 2, 0, 1, 1, 1, 0, 1, 2, 1, 1, 1, 0, 1, 2, 1, 0,
  1, 0, 0, 1, 2, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0,
  0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 2, 0, 1, 1, 0, 2, 2, 0, 0, 0,
  0, 1, 2, 2, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 2, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0,
  0, 1, 0, 2, 1, 1, 2, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 2, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 2, 0, 0, 0, 0, 0, 2, 0, 1, 1, 1, 2, 1, 1, 1,
  2, 2, 1, 0, 1, 2, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 2, 0, 1, 2, 0, 0, 1, 2, 1, 1, 2, 1, 0, 0, 0,
  1, 2, 1, 1, 1, 1, 2, 1, 0, 1, 1, 0, 2, 0, 0, 2, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 2, 1, 2, 0, 1,
  1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 2, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0,
  2, 1, 1, 0, 1, 0, 1, 2, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 2, 1, 0, 0, 2, 0, 0, 1, 0,
  2, 1, 0, 0, 0, 0,
]);

export const projectRuntimeMetricsBySlug = {
  "codex-vibe-monitor": {
    kind: "codex-vibe-monitor",
    tokensPerMinute: { value: 793758, trend: cvmTokensPerMinuteTrend },
    parallelCalls: { value: 0, trend: cvmParallelCallsTrend },
    todayTokens: { value: 2110898841, trend: cvmTodayTokensTrend },
    tokenActivity90d,
  },
  "tavily-hikari": {
    kind: "tavily-hikari",
    todayRequests: { value: 0, trend: hikariTodayRequestsTrend },
    todayCredits: { value: 0, trend: hikariTodayCreditsTrend },
    monthCredits: { value: 1587, trend: hikariMonthCreditsTrend },
    totalCredits: { value: 21000, trend: hikariTotalCreditsTrend },
    requestActivity90d,
  },
  "octo-rill": {
    kind: "octo-rill",
    deduplicatedRepositories: { value: 501, trend: octoRepositoryTrend },
    pressure: { value: 7.51, trend: octoPressureTrend },
    freshness: octoFreshnessU8,
  },
} satisfies Record<string, ProjectRuntimeMetrics>;

export function getProjectRuntimeMetrics(slug: string): ProjectRuntimeMetrics | undefined {
  return projectRuntimeMetricsBySlug[slug as keyof typeof projectRuntimeMetricsBySlug];
}
