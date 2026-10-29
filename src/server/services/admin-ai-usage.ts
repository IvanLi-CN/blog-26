import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";
import type { AiDatabase } from "@/lib/ai-usage";
import {
  DEFAULT_AI_USAGE_TIMEZONE,
  getAssistantQuotaPolicy,
  getAssistantQuotaSnapshot,
  resetAssistantQuota,
} from "@/lib/ai-usage";
import { db, initializeDB } from "@/lib/db";
import {
  aiUsageDailySummaries,
  aiUsageRecords,
  frontendIdentityLinks,
  frontendUsers,
} from "@/lib/schema";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const DETAIL_RETENTION_DAYS = 90;
const MAX_DETAIL_ROWS = 500;

export const ADMIN_USAGE_RANGES = ["today", "7d", "30d", "90d", "365d", "custom"] as const;
export type AdminUsageRange = (typeof ADMIN_USAGE_RANGES)[number];
export type AdminUsageGroupBy = "user" | "feature" | "model";

export type AdminUsageFilters = {
  frontendUserId?: string;
  feature?: string;
  model?: string;
  status?: "success" | "failure" | "cancelled" | "missing" | "incomplete";
};

export type AdminUsageMetric = {
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCallCount: number;
  incompleteCallCount: number;
  successCallCount: number;
  failureCallCount: number;
  cancelledCallCount: number;
  actualCallCount: number;
  missingCallCount: number;
};

export type AdminUsageRetention = {
  detailRetentionDays: number;
  detailAvailableFrom: string;
  rangeCoverage: "detail" | "mixed" | "summary";
  resultFilterCoverage: "detail" | "mixed" | "summary";
};

export type AdminUsageDetail = {
  id: string;
  day: string;
  occurredAt: number;
  frontendUserId: string | null;
  feature: string;
  provider: string | null;
  model: string | null;
  status: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  estimated: boolean;
  usageComplete: boolean;
};

export type AdminUsageOverview = {
  timezone: string;
  range: { preset: AdminUsageRange; from: string; to: string; startAt: number; endAt: number };
  metric: AdminUsageMetric;
  trend: Array<AdminUsageMetric & { day: string }>;
  groups: Array<
    AdminUsageMetric & {
      key: string;
      label: string;
      frontendUserId: string | null;
      feature: string | null;
      model: string | null;
    }
  >;
  details: AdminUsageDetail[];
  detailTotal: number;
  detailsTruncated: boolean;
  facets: { users: Array<{ id: string; label: string }>; features: string[]; models: string[] };
  retention: AdminUsageRetention;
};

export type AdminUsageUser = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  profileUrl: string | null;
  isAdmin: boolean;
  identityProviders: string[];
  usage: {
    hour: AdminUsageMetric;
    week: AdminUsageMetric;
    allTime: AdminUsageMetric;
  };
  quota: Awaited<ReturnType<typeof getAssistantQuotaSnapshot>>;
  quotaStatus: "unlimited" | "available" | "exhausted";
};

export type AdminUsersResponse = {
  users: AdminUsageUser[];
  total: number;
  policy: Awaited<ReturnType<typeof getAssistantQuotaPolicy>>;
};

type UsageDimension = {
  day: string;
  occurredAt: number | null;
  frontendUserId: string | null;
  feature: string;
  provider: string | null;
  model: string | null;
  status: string | null;
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCallCount: number;
  incompleteCallCount: number;
  successCallCount: number;
  failureCallCount: number;
  cancelledCallCount: number;
};

type DateRange = {
  preset: AdminUsageRange;
  from: string;
  to: string;
  startAt: number;
  endAt: number;
};

function databaseOrThrow(databaseOverride?: AiDatabase): AiDatabase {
  if (databaseOverride) return databaseOverride;
  if (!db) throw new Error("Database has not been initialized");
  return db;
}

async function getDatabase(databaseOverride?: AiDatabase) {
  if (!databaseOverride && !db) await initializeDB();
  return databaseOrThrow(databaseOverride);
}

function localDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function dayKey(date: Date, timeZone: string) {
  const parts = localDateParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shiftDay(day: string, offset: number) {
  const shifted = new Date(`${day}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

function localMidnightUtc(day: string, timeZone: string) {
  const guess = Date.parse(`${day}T00:00:00.000Z`);
  let instant = guess;
  for (let index = 0; index < 3; index++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
    );
    const localAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    instant += guess - localAsUtc;
  }
  return instant;
}

function validDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function resolveAdminUsageRange(input: {
  range?: AdminUsageRange;
  from?: string;
  to?: string;
  timezone?: string;
  now?: number;
}): DateRange & { timezone: string } {
  const timezone = input.timezone || DEFAULT_AI_USAGE_TIMEZONE;
  const now = input.now ?? Date.now();
  const today = dayKey(new Date(now), timezone);
  const preset = input.range ?? "7d";
  const days =
    preset === "today"
      ? 1
      : preset === "7d"
        ? 7
        : preset === "30d"
          ? 30
          : preset === "90d"
            ? 90
            : preset === "365d"
              ? 365
              : 0;
  const from = days ? shiftDay(today, -(days - 1)) : input.from;
  const to = days ? today : input.to;
  if (!validDay(from) || !validDay(to) || (from as string) > (to as string)) {
    throw new Error("Invalid AI usage date range");
  }
  return {
    timezone,
    preset,
    from: from as string,
    to: to as string,
    startAt: localMidnightUtc(from as string, timezone),
    endAt: localMidnightUtc(shiftDay(to as string, 1), timezone),
  };
}

function emptyMetric(): AdminUsageMetric {
  return {
    callCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCallCount: 0,
    incompleteCallCount: 0,
    successCallCount: 0,
    failureCallCount: 0,
    cancelledCallCount: 0,
    actualCallCount: 0,
    missingCallCount: 0,
  };
}

function metricFromRows(rows: UsageDimension[]): AdminUsageMetric {
  const metric = emptyMetric();
  for (const row of rows) {
    metric.callCount += row.callCount;
    metric.inputTokens += row.inputTokens;
    metric.cachedInputTokens += row.cachedInputTokens;
    metric.outputTokens += row.outputTokens;
    metric.reasoningTokens += row.reasoningTokens;
    metric.totalTokens += row.totalTokens;
    metric.estimatedCallCount += row.estimatedCallCount;
    metric.incompleteCallCount += row.incompleteCallCount;
    metric.successCallCount += row.successCallCount;
    metric.failureCallCount += row.failureCallCount;
    metric.cancelledCallCount += row.cancelledCallCount;
  }
  metric.actualCallCount = Math.max(0, metric.callCount - metric.estimatedCallCount);
  metric.missingCallCount = metric.incompleteCallCount;
  return metric;
}

function recordDimension(
  row: typeof aiUsageRecords.$inferSelect,
  timezone: string
): UsageDimension {
  return {
    day: dayKey(new Date(row.occurredAt), timezone),
    occurredAt: row.occurredAt,
    frontendUserId: row.frontendUserId,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    status: row.status,
    callCount: 1,
    inputTokens: row.inputTokens ?? 0,
    cachedInputTokens: row.cachedInputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    reasoningTokens: row.reasoningTokens ?? 0,
    totalTokens: row.totalTokens ?? 0,
    estimatedCallCount: row.estimated ? 1 : 0,
    incompleteCallCount: row.usageComplete ? 0 : 1,
    successCallCount: row.status === "success" ? 1 : 0,
    failureCallCount: row.status === "failure" ? 1 : 0,
    cancelledCallCount: row.status === "cancelled" ? 1 : 0,
  };
}

function summaryDimension(row: typeof aiUsageDailySummaries.$inferSelect): UsageDimension {
  return {
    day: row.day,
    occurredAt: null,
    frontendUserId: row.frontendUserId,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    status: null,
    callCount: row.callCount,
    inputTokens: row.inputTokens,
    cachedInputTokens: row.cachedInputTokens,
    outputTokens: row.outputTokens,
    reasoningTokens: row.reasoningTokens,
    totalTokens: row.totalTokens,
    estimatedCallCount: row.estimatedCallCount,
    incompleteCallCount: row.incompleteCallCount,
    successCallCount: row.successCallCount,
    failureCallCount: row.failureCallCount,
    cancelledCallCount: row.cancelledCallCount,
  };
}

function matchesFilters(row: UsageDimension, filters: AdminUsageFilters) {
  if (filters.frontendUserId && row.frontendUserId !== filters.frontendUserId) return false;
  if (filters.feature && row.feature !== filters.feature) return false;
  if (filters.model && row.model !== filters.model) return false;
  if (filters.status && row.status !== null && row.status !== filters.status) return false;
  // A daily summary cannot safely be split by result. Do not claim precision for it.
  if (filters.status && row.status === null) return false;
  return true;
}

function detailFromRecord(
  row: typeof aiUsageRecords.$inferSelect,
  timezone: string
): AdminUsageDetail {
  return {
    id: row.id,
    day: dayKey(new Date(row.occurredAt), timezone),
    occurredAt: row.occurredAt,
    frontendUserId: row.frontendUserId,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputTokens: row.inputTokens,
    cachedInputTokens: row.cachedInputTokens,
    outputTokens: row.outputTokens,
    reasoningTokens: row.reasoningTokens,
    totalTokens: row.totalTokens,
    estimated: row.estimated,
    usageComplete: row.usageComplete,
  };
}

async function loadDimensions(
  range: { startAt: number; endAt: number; from: string; to: string },
  timezone: string,
  database: AiDatabase,
  filters: AdminUsageFilters = {},
  now = Date.now()
) {
  const detailCutoff = now - DETAIL_RETENTION_DAYS * DAY_MS;
  const records = await database
    .select()
    .from(aiUsageRecords)
    .where(
      and(
        gte(aiUsageRecords.occurredAt, Math.max(range.startAt, detailCutoff)),
        lt(aiUsageRecords.occurredAt, range.endAt)
      )
    )
    .orderBy(desc(aiUsageRecords.occurredAt))
    .all();
  const summaries = await database
    .select()
    .from(aiUsageDailySummaries)
    .where(
      and(
        eq(aiUsageDailySummaries.timezone, timezone),
        gte(aiUsageDailySummaries.day, range.from),
        lte(aiUsageDailySummaries.day, range.to)
      )
    )
    .orderBy(asc(aiUsageDailySummaries.day))
    .all();
  const summaryDays = new Set(summaries.map((row) => row.day));
  const dimensions = [
    ...records
      .filter(
        (row) => filters.status || !summaryDays.has(dayKey(new Date(row.occurredAt), timezone))
      )
      .map((row) => recordDimension(row, timezone)),
    ...(filters.status ? [] : summaries.map(summaryDimension)),
  ].filter((row) => matchesFilters(row, filters));
  return { dimensions, records, detailCutoff };
}

function metricGroups(
  rows: UsageDimension[],
  groupBy: AdminUsageGroupBy,
  labels: Map<string, string>
) {
  const grouped = new Map<string, UsageDimension[]>();
  for (const row of rows) {
    const key =
      groupBy === "user"
        ? (row.frontendUserId ?? "unassigned")
        : groupBy === "feature"
          ? row.feature
          : (row.model ?? "unknown");
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, groupedRows]) => ({
      key,
      label: labels.get(key) ?? key,
      frontendUserId: groupBy === "user" && key !== "unassigned" ? key : null,
      feature: groupBy === "feature" ? key : null,
      model: groupBy === "model" && key !== "unknown" ? key : null,
      ...metricFromRows(groupedRows),
    }))
    .sort(
      (left, right) => right.totalTokens - left.totalTokens || left.label.localeCompare(right.label)
    );
}

function retentionFor(
  range: DateRange,
  timezone: string,
  detailCutoff: number,
  filters: AdminUsageFilters
) {
  const detailAvailableFrom = dayKey(new Date(detailCutoff), timezone);
  const hasSummaryCoverage = range.startAt < detailCutoff;
  const hasDetailCoverage = range.endAt > detailCutoff;
  return {
    detailRetentionDays: DETAIL_RETENTION_DAYS,
    detailAvailableFrom,
    rangeCoverage:
      hasSummaryCoverage && hasDetailCoverage ? "mixed" : hasSummaryCoverage ? "summary" : "detail",
    resultFilterCoverage: filters.status
      ? hasSummaryCoverage
        ? "summary"
        : "detail"
      : hasSummaryCoverage && hasDetailCoverage
        ? "mixed"
        : hasSummaryCoverage
          ? "summary"
          : "detail",
  } satisfies AdminUsageRetention;
}

export async function getAdminAiUsageOverview(
  input: {
    range?: AdminUsageRange;
    from?: string;
    to?: string;
    timezone?: string;
    groupBy?: AdminUsageGroupBy;
    filters?: AdminUsageFilters;
    now?: number;
    database?: AiDatabase;
  } = {}
): Promise<AdminUsageOverview> {
  const database = await getDatabase(input.database);
  // Daily maintenance uses the product timezone. Keep reads on that same bucket
  // even when an older quota policy row still carries a different timezone.
  const timezone = input.timezone || DEFAULT_AI_USAGE_TIMEZONE;
  const range = resolveAdminUsageRange({ ...input, timezone });
  const filters = input.filters ?? {};
  const loaded = await loadDimensions(range, timezone, database, filters, input.now);
  const facetLoaded =
    filters.frontendUserId || filters.feature || filters.model || filters.status
      ? await loadDimensions(range, timezone, database, {}, input.now)
      : loaded;
  const labels = new Map<string, string>();
  const users = await database
    .select({ id: frontendUsers.id, displayName: frontendUsers.displayName })
    .from(frontendUsers)
    .all();
  for (const user of users) labels.set(user.id, user.displayName);
  const days: Array<AdminUsageMetric & { day: string }> = [];
  for (let day = range.from; day <= range.to; day = shiftDay(day, 1)) {
    days.push({ day, ...metricFromRows(loaded.dimensions.filter((row) => row.day === day)) });
  }
  const features = [...new Set(facetLoaded.dimensions.map((row) => row.feature))].sort();
  const models = [
    ...new Set(
      facetLoaded.dimensions
        .map((row) => row.model)
        .filter((model): model is string => Boolean(model))
    ),
  ].sort();
  const detailRecords = loaded.records.filter((row) =>
    matchesFilters(recordDimension(row, timezone), filters)
  );
  return {
    timezone,
    range,
    metric: metricFromRows(loaded.dimensions),
    trend: days,
    groups: metricGroups(loaded.dimensions, input.groupBy ?? "feature", labels),
    details: detailRecords.slice(0, MAX_DETAIL_ROWS).map((row) => detailFromRecord(row, timezone)),
    detailTotal: detailRecords.length,
    detailsTruncated: detailRecords.length > MAX_DETAIL_ROWS,
    facets: {
      users: users
        .map((user) => ({ id: user.id, label: user.displayName }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      features,
      models,
    },
    retention: retentionFor(range, timezone, loaded.detailCutoff, filters),
  };
}

export async function listAdminUsers(
  input: { search?: string; now?: number; database?: AiDatabase } = {}
): Promise<AdminUsersResponse> {
  const database = await getDatabase(input.database);
  const now = input.now ?? Date.now();
  const policy = await getAssistantQuotaPolicy(database);
  const timezone = DEFAULT_AI_USAGE_TIMEZONE;
  const allRange = {
    from: "0000-01-01",
    to: dayKey(new Date(now), timezone),
    startAt: 0,
    endAt: now + 1,
  };
  const loaded = await loadDimensions(allRange, timezone, database, {}, now);
  const identities = await database
    .select({
      frontendUserId: frontendIdentityLinks.frontendUserId,
      provider: frontendIdentityLinks.provider,
    })
    .from(frontendIdentityLinks)
    .all();
  const providers = new Map<string, string[]>();
  for (const identity of identities)
    providers.set(identity.frontendUserId, [
      ...(providers.get(identity.frontendUserId) ?? []),
      identity.provider,
    ]);
  const users = await database
    .select()
    .from(frontendUsers)
    .orderBy(asc(frontendUsers.displayName))
    .all();
  const query = input.search?.trim().toLocaleLowerCase();
  const filtered = query
    ? users.filter((user) =>
        `${user.displayName} ${user.email ?? ""}`.toLocaleLowerCase().includes(query)
      )
    : users;
  const details = loaded.records;
  const result = await Promise.all(
    filtered.map(async (user) => {
      const quota = await getAssistantQuotaSnapshot(user.id, { now, database });
      const hourRows = details
        .filter(
          (row) =>
            row.frontendUserId === user.id &&
            row.occurredAt >= now - HOUR_MS &&
            row.occurredAt <= now
        )
        .map((row) => recordDimension(row, timezone));
      const weekRows = details
        .filter(
          (row) =>
            row.frontendUserId === user.id &&
            row.occurredAt >= now - 7 * DAY_MS &&
            row.occurredAt <= now
        )
        .map((row) => recordDimension(row, timezone));
      const allRows = loaded.dimensions.filter((row) => row.frontendUserId === user.id);
      const exhausted =
        !user.isAdmin &&
        (quota.tokenHour >= quota.policy.tokenHourlyLimit ||
          quota.tokenWeek >= quota.policy.tokenWeeklyLimit ||
          quota.questionHour >= quota.policy.questionHourlyLimit ||
          quota.questionWeek >= quota.policy.questionWeeklyLimit);
      return {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        profileUrl: user.profileUrl,
        isAdmin: user.isAdmin,
        identityProviders: [...new Set(providers.get(user.id) ?? (user.isAdmin ? ["admin"] : []))],
        usage: {
          hour: metricFromRows(hourRows),
          week: metricFromRows(weekRows),
          allTime: metricFromRows(allRows),
        },
        quota,
        quotaStatus: user.isAdmin ? "unlimited" : exhausted ? "exhausted" : "available",
      } satisfies AdminUsageUser;
    })
  );
  return { users: result, total: users.length, policy };
}

export async function resetAdminUserQuota(
  userId: string,
  input: { now?: number; database?: AiDatabase } = {}
) {
  const database = await getDatabase(input.database);
  const user = await database
    .select({ id: frontendUsers.id })
    .from(frontendUsers)
    .where(eq(frontendUsers.id, userId))
    .get();
  if (!user) return null;
  const reset = await resetAssistantQuota(userId, "manual", { now: input.now, database });
  const quota = await getAssistantQuotaSnapshot(userId, { now: input.now, database });
  return { resetAt: reset.resetAt, quota };
}

export { DETAIL_RETENTION_DAYS };
