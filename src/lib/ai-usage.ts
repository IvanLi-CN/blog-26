import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, lt, or } from "drizzle-orm";
import type { AiUsageStatus, AssistantQuotaPolicy } from "@/lib/assistant-contracts";
import { DEFAULT_ASSISTANT_QUOTA_POLICY } from "@/lib/assistant-contracts";
import { db, initializeDB } from "@/lib/db";
import {
  aiUsageDailySummaries,
  aiUsageRecords,
  assistantConversations,
  assistantQuotaPolicies,
  assistantQuotaResets,
  frontendUsers,
} from "@/lib/schema";

export type AiDatabase = NonNullable<typeof db>;
type AiReadDatabase = Pick<AiDatabase, "select">;

const USAGE_VERSION = 1 as const;
const INITIAL_QUOTA_CYCLE = "initial";
const UNKNOWN_TOKEN_RESERVATION = 4_096;
const HOUR_MS = 60 * 60 * 1_000;
const WEEK_MS = 7 * 24 * HOUR_MS;
const DETAIL_RETENTION_MS = 90 * 24 * HOUR_MS;
export const DEFAULT_AI_USAGE_TIMEZONE = "Asia/Shanghai";

export type AiUsageMetadata = Record<string, string | number | boolean | null>;

export type AiUsageContext = {
  feature: string;
  provider?: string | null;
  model?: string | null;
  frontendUserId?: string | null;
  conversationId?: string | null;
  generationJobId?: string | null;
  logicalRequestId?: string | null;
  logicalQuestionId?: string | null;
  manualRetryId?: string | null;
  parentUsageId?: string | null;
  idempotencyKey?: string | null;
  attempt?: number;
  automaticRetry?: boolean;
  manualRetry?: boolean;
  inputEstimateTokens?: number | null;
  outputEstimateTokens?: number | null;
  chargePersonalQuota?: boolean;
  chargeQuestion?: boolean;
  isAdmin?: boolean;
  occurredAt?: number;
  metadata?: AiUsageMetadata;
};

export type NormalizedAiUsage = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  estimated: boolean;
  usageComplete: boolean;
  rawUsage: unknown | null;
};

export type AiUsageRecord = typeof aiUsageRecords.$inferSelect;

export type AiUsageHandle = {
  readonly id: string;
  readonly idempotencyKey: string;
};

export type AiUsageSettlement = {
  status?: AiUsageStatus;
  usage?: unknown;
  error?: unknown;
  estimated?: boolean;
  occurredAt?: number;
  provider?: string | null;
  model?: string | null;
};

export type ProviderCallOutcome = {
  status?: AiUsageStatus;
  usage?: unknown;
  error?: unknown;
  estimated?: boolean;
};

export class AiQuotaExceededError extends Error {
  readonly dimension:
    | "tokens-hour"
    | "tokens-week"
    | "questions-hour"
    | "questions-week"
    | "conversations";
  readonly limit: number;
  readonly used: number;
  readonly requested: number;

  constructor(
    dimension: AiQuotaExceededError["dimension"],
    limit: number,
    used: number,
    requested: number
  ) {
    super(`Assistant quota exceeded: ${dimension}`);
    this.name = "AiQuotaExceededError";
    this.dimension = dimension;
    this.limit = limit;
    this.used = used;
    this.requested = requested;
  }
}

type UsageRaw = {
  version: typeof USAGE_VERSION;
  providerCall: true;
  lifecycle: "reserved" | "settled";
  logicalRequestId: string;
  logicalQuestionId: string | null;
  manualRetryId: string | null;
  automaticRetry: boolean;
  manualRetry: boolean;
  attempt: number;
  quota: {
    personal: boolean;
    chargeQuestion: boolean;
    cycleId: string | null;
    tokenReservation: number;
  };
  reservation: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  containment: {
    parentUsageId: string | null;
    logicalRequestId: string;
  };
  metadata?: AiUsageMetadata;
  providerUsage?: unknown;
  settlement?: {
    status: AiUsageStatus;
    usageComplete: boolean;
    estimated: boolean;
  };
  error?: {
    name: string;
    status?: number;
    code?: string;
    message?: string;
  };
};

type HandleState = {
  database: AiDatabase;
  context: AiUsageContext;
};

const handleStates = new WeakMap<object, HandleState>();

function finiteToken(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function firstToken(value: unknown, paths: readonly (readonly string[])[]): number | null {
  for (const path of paths) {
    const token = finiteToken(readPath(value, path));
    if (token !== null) return token;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function usageObject(value: unknown): unknown {
  if (!isRecord(value)) return null;
  if ("usage" in value) return value.usage ?? null;
  if (
    "input_tokens" in value ||
    "prompt_tokens" in value ||
    "output_tokens" in value ||
    "completion_tokens" in value ||
    "input" in value ||
    "output" in value ||
    "cacheRead" in value ||
    "cacheWrite" in value ||
    "total_tokens" in value ||
    "totalTokens" in value
  ) {
    return value;
  }
  return null;
}

/** Normalize provider-specific usage without adding cached or reasoning subsets twice. */
export function normalizeAiUsage(value: unknown): NormalizedAiUsage {
  const raw = usageObject(value);
  if (!isRecord(raw)) {
    return {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      estimated: false,
      usageComplete: false,
      rawUsage: raw,
    };
  }

  const isPiUsage = "cacheRead" in raw || "cacheWrite" in raw;
  const baseInput = firstToken(raw, [
    ["input_tokens"],
    ["prompt_tokens"],
    ["inputTokens"],
    ["promptTokens"],
    ["input"],
  ]);
  const cached = firstToken(raw, [
    ["prompt_tokens_details", "cached_tokens"],
    ["input_tokens_details", "cached_tokens"],
    ["cached_tokens"],
    ["prompt_cache_hit_tokens"],
    ["cache_read_input_tokens"],
    ["cacheRead"],
  ]);
  const cacheWrite = firstToken(raw, [
    ["prompt_tokens_details", "cache_write_tokens"],
    ["cacheWrite"],
  ]);
  const output = firstToken(raw, [
    ["output_tokens"],
    ["completion_tokens"],
    ["outputTokens"],
    ["completionTokens"],
    ["output"],
  ]);
  const reasoning = firstToken(raw, [
    ["output_tokens_details", "reasoning_tokens"],
    ["completion_tokens_details", "reasoning_tokens"],
    ["reasoning_tokens"],
    ["reasoningTokens"],
    ["reasoning"],
  ]);
  const reportedTotal = firstToken(raw, [["total_tokens"], ["totalTokens"]]);

  let inputTokens = baseInput;
  let outputTokens = output;
  let totalTokens = reportedTotal;
  let estimated = false;

  // pi-ai exposes cacheRead/cacheWrite separately and its input excludes them.
  if (isPiUsage && inputTokens !== null) {
    inputTokens += cached ?? 0;
    inputTokens += cacheWrite ?? 0;
  }

  if (inputTokens === null && totalTokens !== null && outputTokens !== null) {
    inputTokens = Math.max(0, totalTokens - outputTokens);
    estimated = true;
  }
  if (outputTokens === null && totalTokens !== null && inputTokens !== null) {
    outputTokens = Math.max(0, totalTokens - inputTokens);
    estimated = true;
  }
  if (totalTokens === null && inputTokens !== null && outputTokens !== null) {
    totalTokens = inputTokens + outputTokens;
    estimated = true;
  }

  const cachedInputTokens =
    cached === null || inputTokens === null ? cached : Math.min(cached, inputTokens);
  const reasoningTokens =
    reasoning === null || outputTokens === null ? reasoning : Math.min(reasoning, outputTokens);

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    estimated,
    usageComplete: inputTokens !== null && outputTokens !== null,
    rawUsage: raw,
  };
}

export function extractAiUsage(value: unknown): unknown | null {
  return usageObject(value);
}

export function classifyAiUsage(usage: unknown): AiUsageStatus {
  const extracted = usageObject(usage);
  if (!extracted) return "missing";
  return normalizeAiUsage(extracted).usageComplete ? "success" : "incomplete";
}

export function estimateAiTokens(
  inputEstimateTokens?: number | null,
  outputEstimateTokens?: number | null
) {
  const input = finiteToken(inputEstimateTokens) ?? 0;
  const output = finiteToken(outputEstimateTokens) ?? 0;
  if (input + output > 0) {
    return { inputTokens: input, outputTokens: output, totalTokens: input + output };
  }
  return {
    inputTokens: UNKNOWN_TOKEN_RESERVATION,
    outputTokens: 0,
    totalTokens: UNKNOWN_TOKEN_RESERVATION,
  };
}

function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

function parseRaw(value: string | null): UsageRaw | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as UsageRaw;
    return parsed && parsed.version === USAGE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function errorDetails(error: unknown): UsageRaw["error"] {
  if (!error || typeof error !== "object") return { name: typeof error };
  const value = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const details: UsageRaw["error"] = {
    name: typeof value.name === "string" ? value.name : "Error",
  };
  if (typeof value.status === "number" && Number.isFinite(value.status))
    details.status = value.status;
  if (typeof value.code === "string") details.code = value.code.slice(0, 160);
  if (typeof value.message === "string") details.message = value.message.slice(0, 240);
  return details;
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException)
    return error.name === "AbortError" || error.name === "TimeoutError";
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function isAiUsageStoreUnavailable(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /no such table: (?:ai_usage_records|ai_usage_daily_summaries|assistant_quota_policies|assistant_quota_resets|frontend_users)/u.test(
    error.message
  );
}

async function getDatabase(databaseOverride?: AiDatabase): Promise<AiDatabase> {
  if (databaseOverride) return databaseOverride;
  if (!db) await initializeDB();
  if (!db) throw new Error("Database has not been initialized");
  return db;
}

function policyFromRow(row: typeof assistantQuotaPolicies.$inferSelect | undefined, now: number) {
  if (row) return row satisfies AssistantQuotaPolicy;
  return {
    id: "default",
    scope: "global" as const,
    ...DEFAULT_ASSISTANT_QUOTA_POLICY,
    createdAt: now,
    updatedAt: now,
  } satisfies AssistantQuotaPolicy;
}

function quotaCycle(tx: AiReadDatabase, frontendUserId: string, now: number) {
  const reset = tx
    .select()
    .from(assistantQuotaResets)
    .where(
      and(
        eq(assistantQuotaResets.frontendUserId, frontendUserId),
        lt(assistantQuotaResets.resetAt, now + 1)
      )
    )
    .orderBy(desc(assistantQuotaResets.resetAt), desc(assistantQuotaResets.createdAt))
    .limit(1)
    .get();
  return {
    id: reset?.id ?? INITIAL_QUOTA_CYCLE,
    startAt: reset?.resetAt ?? 0,
  };
}

function rawQuotaCycle(raw: UsageRaw | null) {
  return raw?.quota?.cycleId ?? INITIAL_QUOTA_CYCLE;
}

function usageTokenAmount(row: typeof aiUsageRecords.$inferSelect, raw: UsageRaw | null) {
  if (row.totalTokens !== null) return row.totalTokens;
  if (row.inputTokens !== null || row.outputTokens !== null) {
    return (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
  }
  return raw?.reservation?.totalTokens ?? UNKNOWN_TOKEN_RESERVATION;
}

function usageRowsForUser(
  tx: AiReadDatabase,
  frontendUserId: string,
  cycleId: string,
  cycleStart: number,
  now: number
) {
  const rows = tx
    .select()
    .from(aiUsageRecords)
    .where(
      and(
        eq(aiUsageRecords.frontendUserId, frontendUserId),
        gte(aiUsageRecords.occurredAt, cycleStart)
      )
    )
    .all();
  return rows.filter((row) => {
    if (row.occurredAt > now) return false;
    return rawQuotaCycle(parseRaw(row.rawUsage)) === cycleId;
  });
}

function logicalQuestionKeys(
  rows: (typeof aiUsageRecords.$inferSelect)[],
  start: number,
  end: number
) {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.occurredAt < start || row.occurredAt >= end) continue;
    const raw = parseRaw(row.rawUsage);
    if (!raw?.quota.personal || !raw.quota.chargeQuestion) continue;
    keys.add(
      raw.manualRetry
        ? `manual:${raw.manualRetryId ?? raw.logicalRequestId}`
        : raw.logicalQuestionId || row.id
    );
  }
  return keys;
}

function quotaUsage(rows: (typeof aiUsageRecords.$inferSelect)[], now: number) {
  const personalRows = rows.filter((row) => parseRaw(row.rawUsage)?.quota.personal);
  const hourStart = now - HOUR_MS;
  const weekStart = now - WEEK_MS;
  const tokenHour = personalRows
    .filter((row) => row.occurredAt >= hourStart)
    .reduce((sum, row) => sum + usageTokenAmount(row, parseRaw(row.rawUsage)), 0);
  const tokenWeek = personalRows
    .filter((row) => row.occurredAt >= weekStart)
    .reduce((sum, row) => sum + usageTokenAmount(row, parseRaw(row.rawUsage)), 0);
  return {
    tokenHour,
    tokenWeek,
    questionHour: logicalQuestionKeys(personalRows, hourStart, now + 1).size,
    questionWeek: logicalQuestionKeys(personalRows, weekStart, now + 1).size,
  };
}

export async function getAssistantQuotaPolicy(
  databaseOverride?: AiDatabase
): Promise<AssistantQuotaPolicy> {
  const database = await getDatabase(databaseOverride);
  const now = Date.now();
  const row = await database
    .select()
    .from(assistantQuotaPolicies)
    .where(eq(assistantQuotaPolicies.scope, "global"))
    .limit(1)
    .get();
  return policyFromRow(row, now);
}

export async function setAssistantQuotaPolicy(
  input: Omit<AssistantQuotaPolicy, "id" | "scope" | "createdAt" | "updatedAt"> & {
    id?: string;
    now?: number;
  },
  databaseOverride?: AiDatabase
) {
  const database = await getDatabase(databaseOverride);
  const now = input.now ?? Date.now();
  const current = await database
    .select()
    .from(assistantQuotaPolicies)
    .where(eq(assistantQuotaPolicies.scope, "global"))
    .limit(1)
    .get();
  const row = {
    id: current?.id ?? input.id ?? "default",
    scope: "global" as const,
    tokenHourlyLimit: input.tokenHourlyLimit,
    tokenWeeklyLimit: input.tokenWeeklyLimit,
    questionHourlyLimit: input.questionHourlyLimit,
    questionWeeklyLimit: input.questionWeeklyLimit,
    maxConversations: input.maxConversations,
    retentionMs: input.retentionMs,
    timezone: input.timezone,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  } satisfies typeof assistantQuotaPolicies.$inferInsert;
  await database
    .insert(assistantQuotaPolicies)
    .values(row)
    .onConflictDoUpdate({ target: assistantQuotaPolicies.id, set: row });
  return row satisfies AssistantQuotaPolicy;
}

export async function resetAssistantQuota(
  frontendUserId: string,
  reason: "manual" | "window" = "manual",
  options: { now?: number; id?: string; database?: AiDatabase } = {}
) {
  const database = await getDatabase(options.database);
  const now = options.now ?? Date.now();
  const row = {
    id: options.id ?? randomUUID(),
    frontendUserId,
    reason,
    resetAt: now,
    createdAt: now,
  } satisfies typeof assistantQuotaResets.$inferInsert;
  await database.insert(assistantQuotaResets).values(row);
  return row;
}

export async function getAssistantQuotaSnapshot(
  frontendUserId: string,
  options: { now?: number; database?: AiDatabase } = {}
) {
  const database = await getDatabase(options.database);
  const now = options.now ?? Date.now();
  const policy = policyFromRow(
    database
      .select()
      .from(assistantQuotaPolicies)
      .where(eq(assistantQuotaPolicies.scope, "global"))
      .limit(1)
      .get(),
    now
  );
  const cycle = quotaCycle(database, frontendUserId, now);
  const rows = usageRowsForUser(database, frontendUserId, cycle.id, cycle.startAt, now);
  const usage = quotaUsage(rows, now);
  return { policy, cycleId: cycle.id, cycleStartAt: cycle.startAt, ...usage };
}

export async function assertAssistantConversationQuota(
  frontendUserId: string,
  options: { now?: number; database?: AiDatabase; isAdmin?: boolean } = {}
) {
  const database = await getDatabase(options.database);
  const now = options.now ?? Date.now();
  const policy = policyFromRow(
    database
      .select()
      .from(assistantQuotaPolicies)
      .where(eq(assistantQuotaPolicies.scope, "global"))
      .limit(1)
      .get(),
    now
  );
  const active = database
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.frontendUserId, frontendUserId),
        eq(assistantConversations.status, "active"),
        isNull(assistantConversations.deletedAt),
        or(isNull(assistantConversations.expiresAt), gte(assistantConversations.expiresAt, now))
      )
    )
    .all();
  const persistedAdmin = database
    .select({ isAdmin: frontendUsers.isAdmin })
    .from(frontendUsers)
    .where(eq(frontendUsers.id, frontendUserId))
    .get()?.isAdmin;
  if (options.isAdmin || persistedAdmin) {
    return { activeCount: active.length, maxConversations: policy.maxConversations };
  }
  if (active.length >= policy.maxConversations) {
    throw new AiQuotaExceededError("conversations", policy.maxConversations, active.length, 1);
  }
  return { activeCount: active.length, maxConversations: policy.maxConversations };
}

function makeLogicalRequestId(context: AiUsageContext) {
  return context.logicalRequestId?.trim() || `${context.feature}:${randomUUID()}`;
}

function makeIdempotencyKey(context: AiUsageContext, logicalRequestId: string, attempt: number) {
  return (
    context.idempotencyKey?.trim() ||
    `${logicalRequestId}:provider-attempt:${attempt}:${context.manualRetry ? "manual" : "automatic"}`
  );
}

function quotaReservationFromContext(context: AiUsageContext) {
  const estimate = estimateAiTokens(context.inputEstimateTokens, context.outputEstimateTokens);
  const personal = Boolean(
    context.chargePersonalQuota && context.frontendUserId && !context.isAdmin
  );
  const question = Boolean(personal && context.chargeQuestion && !context.automaticRetry);
  return { estimate, personal, question };
}

function rowToHandle(
  row: typeof aiUsageRecords.$inferSelect,
  database: AiDatabase,
  context: AiUsageContext
) {
  const handle = { id: row.id, idempotencyKey: row.idempotencyKey ?? "" } satisfies AiUsageHandle;
  handleStates.set(handle, { database, context });
  return handle;
}

export async function reserveAiUsage(
  context: AiUsageContext,
  databaseOverride?: AiDatabase
): Promise<AiUsageHandle> {
  if (!context.feature.trim()) throw new Error("AI usage feature is required");
  const database = await getDatabase(databaseOverride);
  const now = context.occurredAt ?? Date.now();
  const logicalRequestId = makeLogicalRequestId(context);
  const attempt = Math.max(1, Math.floor(context.attempt ?? 1));
  const idempotencyKey = makeIdempotencyKey(context, logicalRequestId, attempt);
  return database.transaction(
    (tx) => {
      const existing = tx
        .select()
        .from(aiUsageRecords)
        .where(eq(aiUsageRecords.idempotencyKey, idempotencyKey))
        .get();
      if (existing) return rowToHandle(existing, database, context);

      const persistedAdmin = context.frontendUserId
        ? tx
            .select({ isAdmin: frontendUsers.isAdmin })
            .from(frontendUsers)
            .where(eq(frontendUsers.id, context.frontendUserId))
            .get()?.isAdmin
        : false;
      const quotaContext =
        context.isAdmin || persistedAdmin ? { ...context, isAdmin: true } : context;
      const { estimate, personal, question } = quotaReservationFromContext(quotaContext);
      let cycleId: string | null = null;
      let cycleStartAt = 0;
      if (personal && context.frontendUserId) {
        const cycle = quotaCycle(tx, context.frontendUserId, now);
        cycleId = cycle.id;
        cycleStartAt = cycle.startAt;
        const policy = policyFromRow(
          tx
            .select()
            .from(assistantQuotaPolicies)
            .where(eq(assistantQuotaPolicies.scope, "global"))
            .limit(1)
            .get(),
          now
        );
        const rows = usageRowsForUser(tx, context.frontendUserId, cycleId, cycleStartAt, now);
        const usage = quotaUsage(rows, now);
        const questionIdentity = context.manualRetry
          ? context.manualRetryId
          : context.logicalQuestionId;
        const questionAlreadyReserved = Boolean(
          question &&
            questionIdentity &&
            rows.some((row) => {
              const raw = parseRaw(row.rawUsage);
              return (
                raw?.quota.chargeQuestion &&
                (context.manualRetry
                  ? raw.manualRetryId === questionIdentity
                  : raw.logicalQuestionId === questionIdentity) &&
                row.occurredAt >= now - WEEK_MS
              );
            })
        );
        const chargeQuestion =
          question &&
          (!questionAlreadyReserved || (context.manualRetry === true && !context.manualRetryId));
        if (
          policy.tokenHourlyLimit >= 0 &&
          usage.tokenHour + estimate.totalTokens > policy.tokenHourlyLimit
        ) {
          throw new AiQuotaExceededError(
            "tokens-hour",
            policy.tokenHourlyLimit,
            usage.tokenHour,
            estimate.totalTokens
          );
        }
        if (
          policy.tokenWeeklyLimit >= 0 &&
          usage.tokenWeek + estimate.totalTokens > policy.tokenWeeklyLimit
        ) {
          throw new AiQuotaExceededError(
            "tokens-week",
            policy.tokenWeeklyLimit,
            usage.tokenWeek,
            estimate.totalTokens
          );
        }
        if (chargeQuestion && usage.questionHour + 1 > policy.questionHourlyLimit) {
          throw new AiQuotaExceededError(
            "questions-hour",
            policy.questionHourlyLimit,
            usage.questionHour,
            1
          );
        }
        if (chargeQuestion && usage.questionWeek + 1 > policy.questionWeeklyLimit) {
          throw new AiQuotaExceededError(
            "questions-week",
            policy.questionWeeklyLimit,
            usage.questionWeek,
            1
          );
        }
        if (!chargeQuestion) {
          // Repeated provider attempts belong to the existing logical question.
          // The token reservation remains per provider call.
          context = { ...context, chargeQuestion: false };
        }
      }

      const raw: UsageRaw = {
        version: USAGE_VERSION,
        providerCall: true,
        lifecycle: "reserved",
        logicalRequestId,
        logicalQuestionId: context.logicalQuestionId ?? null,
        manualRetryId: context.manualRetryId ?? null,
        automaticRetry: Boolean(context.automaticRetry),
        manualRetry: Boolean(context.manualRetry),
        attempt,
        quota: {
          personal,
          chargeQuestion:
            personal &&
            question &&
            (!context.logicalQuestionId || context.chargeQuestion !== false),
          cycleId,
          tokenReservation: estimate.totalTokens,
        },
        reservation: estimate,
        containment: {
          parentUsageId: context.parentUsageId ?? null,
          logicalRequestId,
        },
        ...(context.metadata ? { metadata: context.metadata } : {}),
      };
      const row = {
        id: randomUUID(),
        frontendUserId: context.frontendUserId ?? null,
        conversationId: context.conversationId ?? null,
        generationJobId: context.generationJobId ?? null,
        feature: context.feature,
        provider: context.provider ?? null,
        model: context.model ?? null,
        status: "incomplete" as const,
        inputTokens: estimate.inputTokens,
        cachedInputTokens: null,
        outputTokens: estimate.outputTokens,
        reasoningTokens: null,
        totalTokens: estimate.totalTokens,
        estimated: true,
        usageComplete: false,
        idempotencyKey,
        occurredAt: now,
        createdAt: now,
        rawUsage: safeJson(raw),
      } satisfies typeof aiUsageRecords.$inferInsert;
      tx.insert(aiUsageRecords).values(row).run();
      return rowToHandle(row as typeof aiUsageRecords.$inferSelect, database, context);
    },
    { behavior: "immediate" }
  );
}

function mergeRaw(
  raw: UsageRaw | null,
  settlement: AiUsageSettlement,
  normalized: NormalizedAiUsage
): UsageRaw {
  const base =
    raw ??
    ({
      version: USAGE_VERSION,
      providerCall: true as const,
      lifecycle: "reserved" as const,
      logicalRequestId: randomUUID(),
      logicalQuestionId: null,
      manualRetryId: null,
      automaticRetry: false,
      manualRetry: false,
      attempt: 1,
      quota: {
        personal: false,
        chargeQuestion: false,
        cycleId: null,
        tokenReservation: UNKNOWN_TOKEN_RESERVATION,
      },
      reservation: estimateAiTokens(),
      containment: { parentUsageId: null, logicalRequestId: randomUUID() },
    } satisfies UsageRaw);
  const status = settlement.status ?? (normalized.usageComplete ? "success" : "missing");
  const next: UsageRaw = {
    ...base,
    lifecycle: "settled",
    providerUsage: normalized.rawUsage ?? base.providerUsage,
    settlement: {
      status,
      usageComplete: normalized.usageComplete,
      estimated: normalized.estimated || Boolean(settlement.estimated),
    },
  };
  if (settlement.error) next.error = errorDetails(settlement.error);
  return next;
}

export async function settleAiUsage(
  handle: AiUsageHandle,
  settlement: AiUsageSettlement,
  databaseOverride?: AiDatabase
) {
  const state = handleStates.get(handle);
  const database = databaseOverride ?? state?.database ?? (await getDatabase());
  let affectedOccurredAt: number[] = [];
  const settled = await database.transaction(
    (tx) => {
      const current = tx
        .select()
        .from(aiUsageRecords)
        .where(eq(aiUsageRecords.id, handle.id))
        .get();
      if (!current) return null;
      affectedOccurredAt = [current.occurredAt, settlement.occurredAt ?? current.occurredAt];
      const raw = parseRaw(current.rawUsage);
      const normalized = normalizeAiUsage(settlement.usage);
      const hasCompleteCorrection = normalized.usageComplete;
      const currentRawStatus = raw?.settlement?.status;
      if (currentRawStatus && current.usageComplete && !hasCompleteCorrection) return current;

      const reservation = raw?.reservation ?? estimateAiTokens();
      const inputTokens = normalized.inputTokens ?? current.inputTokens ?? reservation.inputTokens;
      const outputTokens =
        normalized.outputTokens ?? current.outputTokens ?? reservation.outputTokens;
      const totalTokens =
        normalized.totalTokens ??
        (normalized.inputTokens !== null || normalized.outputTokens !== null
          ? inputTokens + outputTokens
          : (current.totalTokens ?? inputTokens + outputTokens));
      const estimated =
        Boolean(settlement.estimated) ||
        normalized.estimated ||
        normalized.inputTokens === null ||
        normalized.outputTokens === null ||
        normalized.totalTokens === null;
      const status =
        settlement.status ??
        (currentRawStatus === "failure" || currentRawStatus === "cancelled"
          ? currentRawStatus
          : normalized.usageComplete
            ? "success"
            : normalized.rawUsage
              ? "incomplete"
              : "missing");
      const nextRaw = mergeRaw(raw, { ...settlement, status }, normalized);
      const nextRow = {
        status,
        provider: settlement.provider ?? current.provider,
        model: settlement.model ?? current.model,
        inputTokens,
        cachedInputTokens: normalized.cachedInputTokens ?? current.cachedInputTokens,
        outputTokens,
        reasoningTokens: normalized.reasoningTokens ?? current.reasoningTokens,
        totalTokens,
        estimated,
        usageComplete: normalized.usageComplete,
        occurredAt: settlement.occurredAt ?? current.occurredAt,
        rawUsage: safeJson(nextRaw),
      } satisfies Partial<typeof aiUsageRecords.$inferInsert>;
      tx.update(aiUsageRecords).set(nextRow).where(eq(aiUsageRecords.id, handle.id)).run();
      return tx.select().from(aiUsageRecords).where(eq(aiUsageRecords.id, handle.id)).get();
    },
    { behavior: "immediate" }
  );
  if (settled && affectedOccurredAt.length) {
    try {
      await backfillAiUsageSummaries(database, affectedOccurredAt);
    } catch (error) {
      if (!isAiUsageStoreUnavailable(error)) {
        console.error("[ai-usage] failed to backfill daily summaries", error);
      }
    }
  }
  return settled;
}

export async function meterProviderCall<T>(options: {
  context: AiUsageContext;
  call: () => Promise<T>;
  getOutcome?: (value: T) => ProviderCallOutcome | Promise<ProviderCallOutcome>;
  database?: AiDatabase;
}): Promise<T> {
  let handle: AiUsageHandle;
  try {
    handle = await reserveAiUsage(options.context, options.database);
  } catch (error) {
    // Keep provider contract tests and pre-migration startup usable. Quota errors
    // and ordinary database failures remain fail-closed; only missing metering
    // tables use the explicitly unmetered compatibility path.
    if (!isAiUsageStoreUnavailable(error)) throw error;
    return options.call();
  }
  try {
    const value = await options.call();
    const defaultUsage = extractAiUsage(value);
    let outcome: ProviderCallOutcome = {
      status: "success",
      usage: defaultUsage,
    };
    try {
      if (options.getOutcome) outcome = await options.getOutcome(value);
    } catch (error) {
      outcome = { status: "incomplete", error, usage: extractAiUsage(value) };
    }
    try {
      await settleAiUsage(handle, outcome, options.database);
    } catch (error) {
      console.error("[ai-usage] failed to settle provider success", error);
    }
    return value;
  } catch (error) {
    try {
      await settleAiUsage(
        handle,
        {
          status: isAbortError(error) ? "cancelled" : "failure",
          error,
        },
        options.database
      );
    } catch (settleError) {
      console.error("[ai-usage] failed to settle provider failure", settleError);
    }
    throw error;
  }
}

function localDateParts(date: Date, timeZone: string) {
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
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function dayKey(date: Date, timeZone: string) {
  const parts = localDateParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function calendarDayKey(date: Date, timeZone: string, offsetDays: number) {
  const parts = localDateParts(date, timeZone);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) + offsetDays * 24 * HOUR_MS
  );
  return `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function localMidnightUtc(day: string, timeZone: string) {
  const guess = Date.parse(`${day}T00:00:00.000Z`);
  let instant = guess;
  for (let index = 0; index < 3; index++) {
    const parts = localDateParts(new Date(instant), timeZone);
    const localAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    instant += guess - localAsUtc;
  }
  return instant;
}

function summaryId(values: {
  day: string;
  timezone: string;
  frontendUserId: string | null;
  feature: string;
  provider: string | null;
  model: string | null;
}) {
  return createHash("sha256")
    .update(
      [
        values.day,
        values.timezone,
        values.frontendUserId,
        values.feature,
        values.provider,
        values.model,
      ]
        .map((value) => value ?? "<null>")
        .join("\u0000")
    )
    .digest("hex");
}

function dimensionWhere(
  day: string,
  timezone: string,
  frontendUserId: string | null,
  feature: string,
  provider: string | null,
  model: string | null
) {
  return and(
    eq(aiUsageDailySummaries.day, day),
    eq(aiUsageDailySummaries.timezone, timezone),
    frontendUserId === null
      ? isNull(aiUsageDailySummaries.frontendUserId)
      : eq(aiUsageDailySummaries.frontendUserId, frontendUserId),
    eq(aiUsageDailySummaries.feature, feature),
    provider === null
      ? isNull(aiUsageDailySummaries.provider)
      : eq(aiUsageDailySummaries.provider, provider),
    model === null ? isNull(aiUsageDailySummaries.model) : eq(aiUsageDailySummaries.model, model)
  );
}

async function backfillAiUsageSummaries(database: AiDatabase, occurredAtValues: readonly number[]) {
  const summaries = await database
    .select({ day: aiUsageDailySummaries.day, timezone: aiUsageDailySummaries.timezone })
    .from(aiUsageDailySummaries)
    .all();
  const affected = new Map<string, { day: string; timezone: string }>();
  for (const occurredAt of new Set(occurredAtValues)) {
    const date = new Date(occurredAt);
    if (Number.isNaN(date.getTime())) continue;
    for (const summary of summaries) {
      if (summary.day !== dayKey(date, summary.timezone)) continue;
      affected.set(`${summary.day}\u0000${summary.timezone}`, summary);
    }
  }
  for (const summary of affected.values()) {
    await rollupAiUsageDay({
      day: summary.day,
      timezone: summary.timezone,
      now: Date.now(),
      database,
    });
  }
}

export async function rollupAiUsageDay(
  options: { day?: string; timezone?: string; now?: number; database?: AiDatabase } = {}
) {
  const database = await getDatabase(options.database);
  const now = options.now ?? Date.now();
  const timezone = options.timezone ?? "UTC";
  const day = options.day ?? calendarDayKey(new Date(now), timezone, -1);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new Error("Invalid usage rollup day");
  const start = localMidnightUtc(day, timezone);
  const end = localMidnightUtc(dayKey(new Date(start + 36 * HOUR_MS), timezone), timezone);
  // Read and write in one immediate transaction so concurrent backfills cannot
  // commit a stale detail snapshot after a newer summary.
  const result = await database.transaction(
    (tx) => {
      const rows = tx
        .select()
        .from(aiUsageRecords)
        .where(and(gte(aiUsageRecords.occurredAt, start), lt(aiUsageRecords.occurredAt, end)))
        .all();
      type UsageRollupGroup = {
        day: string;
        timezone: string;
        frontendUserId: string | null;
        feature: string;
        provider: string | null;
        model: string | null;
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
      const groups = new Map<string, UsageRollupGroup>();
      for (const row of rows) {
        const keyValues = {
          day,
          timezone,
          frontendUserId: row.frontendUserId,
          feature: row.feature,
          provider: row.provider,
          model: row.model,
        };
        const key = JSON.stringify(keyValues);
        const group = groups.get(key) ?? {
          ...keyValues,
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
        };
        group.callCount += 1;
        group.inputTokens += row.inputTokens ?? 0;
        group.cachedInputTokens += row.cachedInputTokens ?? 0;
        group.outputTokens += row.outputTokens ?? 0;
        group.reasoningTokens += row.reasoningTokens ?? 0;
        group.totalTokens += row.totalTokens ?? 0;
        if (row.estimated) group.estimatedCallCount += 1;
        if (!row.usageComplete || row.status === "missing" || row.status === "incomplete") {
          group.incompleteCallCount += 1;
        }
        if (row.status === "success") group.successCallCount += 1;
        if (row.status === "failure") group.failureCallCount += 1;
        if (row.status === "cancelled") group.cancelledCallCount += 1;
        groups.set(key, group);
      }

      const existingSummaryRows = tx
        .select()
        .from(aiUsageDailySummaries)
        .where(
          and(eq(aiUsageDailySummaries.day, day), eq(aiUsageDailySummaries.timezone, timezone))
        )
        .all();
      const summarizedCallCount = existingSummaryRows.reduce(
        (total, row) => total + row.callCount,
        0
      );
      // A summary may outlive some of its detail rows. Rebuilding from the partial
      // remainder would silently erase the retained history, so leave it intact.
      const detailsArePartial = rows.length < summarizedCallCount;
      if (detailsArePartial) return { records: rows.length, dimensions: groups.size };

      for (const current of existingSummaryRows) {
        const key = JSON.stringify({
          day: current.day,
          timezone: current.timezone,
          frontendUserId: current.frontendUserId,
          feature: current.feature,
          provider: current.provider,
          model: current.model,
        });
        if (!groups.has(key)) {
          tx.delete(aiUsageDailySummaries).where(eq(aiUsageDailySummaries.id, current.id)).run();
        }
      }
      for (const group of groups.values()) {
        const current = tx
          .select()
          .from(aiUsageDailySummaries)
          .where(
            dimensionWhere(
              group.day,
              group.timezone,
              group.frontendUserId,
              group.feature,
              group.provider,
              group.model
            )
          )
          .get();
        if (current && group.callCount < current.callCount) continue;
        const values = {
          id: current?.id ?? summaryId(group),
          day: group.day,
          timezone: group.timezone,
          frontendUserId: group.frontendUserId,
          feature: group.feature,
          provider: group.provider,
          model: group.model,
          callCount: group.callCount,
          inputTokens: group.inputTokens,
          cachedInputTokens: group.cachedInputTokens,
          outputTokens: group.outputTokens,
          reasoningTokens: group.reasoningTokens,
          totalTokens: group.totalTokens,
          estimatedCallCount: group.estimatedCallCount,
          incompleteCallCount: group.incompleteCallCount,
          successCallCount: group.successCallCount,
          failureCallCount: group.failureCallCount,
          cancelledCallCount: group.cancelledCallCount,
          updatedAt: now,
        } satisfies typeof aiUsageDailySummaries.$inferInsert;
        if (current) {
          tx.update(aiUsageDailySummaries)
            .set(values)
            .where(eq(aiUsageDailySummaries.id, current.id))
            .run();
        } else {
          tx.insert(aiUsageDailySummaries).values(values).run();
        }
      }
      return { records: rows.length, dimensions: groups.size };
    },
    { behavior: "immediate" }
  );
  return { day, timezone, ...result };
}

export async function cleanupAiUsageDetails(
  options: { now?: number; retentionMs?: number; database?: AiDatabase } = {}
) {
  const database = await getDatabase(options.database);
  const cutoff = (options.now ?? Date.now()) - (options.retentionMs ?? DETAIL_RETENTION_MS);
  const rows = await database
    .select({ id: aiUsageRecords.id })
    .from(aiUsageRecords)
    .where(lt(aiUsageRecords.occurredAt, cutoff))
    .all();
  await database.delete(aiUsageRecords).where(lt(aiUsageRecords.occurredAt, cutoff));
  return { cutoff, deleted: rows.length };
}

/**
 * Sole maintenance entry point for a host scheduler or explicit operations trigger.
 * This module does not start a timer; the deployment owns invoking this function.
 */
export async function runAiUsageMaintenance(
  options: { now?: number; timezone?: string; database?: AiDatabase } = {}
) {
  const now = options.now ?? Date.now();
  const timezone = options.timezone ?? DEFAULT_AI_USAGE_TIMEZONE;
  const previousDay = calendarDayKey(new Date(now), timezone, -1);
  const cutoff = now - DETAIL_RETENTION_MS;
  const oldRows = await (await getDatabase(options.database))
    .select({ occurredAt: aiUsageRecords.occurredAt })
    .from(aiUsageRecords)
    .where(lt(aiUsageRecords.occurredAt, cutoff))
    .all();
  const days = new Set([previousDay]);
  for (const row of oldRows) days.add(dayKey(new Date(row.occurredAt), timezone));
  const rollups = [];
  for (const day of days) rollups.push(await rollupAiUsageDay({ ...options, day, timezone, now }));
  const rollup = rollups.find((entry) => entry.day === previousDay) ?? rollups[0];
  const cleanup = await cleanupAiUsageDetails({ ...options, now });
  return { rollup, rollups, cleanup };
}

export async function getAiUsageRecord(id: string, databaseOverride?: AiDatabase) {
  const database = await getDatabase(databaseOverride);
  return database.select().from(aiUsageRecords).where(eq(aiUsageRecords.id, id)).get();
}

export async function listAiUsageRecords(
  options: { frontendUserId?: string | null; feature?: string; database?: AiDatabase } = {}
) {
  const database = await getDatabase(options.database);
  const conditions = [
    options.frontendUserId === undefined
      ? undefined
      : options.frontendUserId === null
        ? isNull(aiUsageRecords.frontendUserId)
        : eq(aiUsageRecords.frontendUserId, options.frontendUserId),
    options.feature ? eq(aiUsageRecords.feature, options.feature) : undefined,
  ].filter(Boolean);
  return database
    .select()
    .from(aiUsageRecords)
    .where(conditions.length ? and(...(conditions as Parameters<typeof and>)) : undefined)
    .orderBy(asc(aiUsageRecords.occurredAt));
}
