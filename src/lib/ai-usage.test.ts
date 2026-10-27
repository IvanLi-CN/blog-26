import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  AiQuotaExceededError,
  assertAssistantConversationQuota,
  cleanupAiUsageDetails,
  getAiUsageRecord,
  getAssistantQuotaSnapshot,
  meterProviderCall,
  normalizeAiUsage,
  reserveAiUsage,
  resetAssistantQuota,
  rollupAiUsageDay,
  runAiUsageMaintenance,
  setAssistantQuotaPolicy,
  settleAiUsage,
} from "@/lib/ai-usage";
import * as schema from "@/lib/schema";
import {
  aiUsageDailySummaries,
  aiUsageRecords,
  assistantConversations,
  frontendUsers,
} from "@/lib/schema";

const sqlite = new Database(":memory:");
const database = drizzle(sqlite, { schema });
const migrationsPath = path.resolve("drizzle");

async function addUser(id: string, isAdmin = false) {
  await database.insert(frontendUsers).values({
    id,
    adminUserId: null,
    isAdmin,
    displayName: id,
    email: null,
    avatarUrl: "/site-assets/default-avatar.svg",
    profileUrl: null,
    createdAt: 1,
    updatedAt: 1,
  });
}

describe("AI usage metering", () => {
  beforeAll(() => {
    migrate(database, { migrationsFolder: migrationsPath });
  });

  beforeEach(async () => {
    await database.delete(aiUsageDailySummaries);
    await database.delete(aiUsageRecords);
    await database.delete(assistantConversations);
    await database.delete(schema.assistantQuotaResets);
    await database.delete(schema.assistantQuotaPolicies);
    await database.delete(frontendUsers);
  });

  afterAll(() => {
    sqlite.close();
  });

  it("keeps cached input and reasoning as contained dimensions", () => {
    expect(
      normalizeAiUsage({
        prompt_tokens: 100,
        prompt_tokens_details: { cached_tokens: 20 },
        completion_tokens: 50,
        completion_tokens_details: { reasoning_tokens: 10 },
        total_tokens: 150,
      })
    ).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
      reasoningTokens: 10,
      totalTokens: 150,
      usageComplete: true,
    });
    expect(
      normalizeAiUsage({ input: 80, cacheRead: 20, output: 30, totalTokens: 130 })
    ).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 30,
      totalTokens: 130,
    });
    expect(
      normalizeAiUsage({
        prompt_tokens: 100,
        prompt_cache_hit_tokens: 33,
        completion_tokens: 10,
        total_tokens: 110,
      })
    ).toMatchObject({ inputTokens: 100, cachedInputTokens: 33, outputTokens: 10 });
  });

  it("reserves atomically, corrects estimates in place, and separates retry kinds", async () => {
    const userId = "metering-user";
    await addUser(userId);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 100,
        tokenWeeklyLimit: 200,
        questionHourlyLimit: 2,
        questionWeeklyLimit: 2,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 100,
      },
      database
    );

    const first = await reserveAiUsage(
      {
        feature: "assistant",
        provider: "openai-compatible",
        model: "assistant-model",
        frontendUserId: userId,
        logicalRequestId: "question-1-provider-1",
        logicalQuestionId: "question-1",
        chargePersonalQuota: true,
        chargeQuestion: true,
        inputEstimateTokens: 20,
        outputEstimateTokens: 10,
        occurredAt: 1_000,
      },
      database
    );
    const estimated = await getAiUsageRecord(first.id, database);
    expect(estimated).toMatchObject({ totalTokens: 30, estimated: true, usageComplete: false });

    await settleAiUsage(
      first,
      {
        status: "missing",
        occurredAt: 1_000,
      },
      database
    );
    await settleAiUsage(
      first,
      {
        usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
        occurredAt: 1_000,
      },
      database
    );
    const corrected = await getAiUsageRecord(first.id, database);
    expect(corrected).toMatchObject({
      totalTokens: 12,
      inputTokens: 8,
      outputTokens: 4,
      estimated: false,
      usageComplete: true,
    });

    const automaticRetry = await reserveAiUsage(
      {
        feature: "assistant-retrieval",
        provider: "openai-compatible",
        model: "retrieval-model",
        frontendUserId: userId,
        logicalRequestId: "question-1-retrieval",
        logicalQuestionId: "question-1",
        chargePersonalQuota: true,
        chargeQuestion: true,
        automaticRetry: true,
        attempt: 2,
        inputEstimateTokens: 4,
        outputEstimateTokens: 4,
        occurredAt: 1_001,
      },
      database
    );
    await settleAiUsage(automaticRetry, { usage: { input_tokens: 4, output_tokens: 4 } }, database);
    expect((await getAssistantQuotaSnapshot(userId, { now: 1_002, database })).questionHour).toBe(
      1
    );

    const manualRetry = await reserveAiUsage(
      {
        feature: "assistant",
        provider: "openai-compatible",
        model: "assistant-model",
        frontendUserId: userId,
        logicalRequestId: "question-2-manual",
        logicalQuestionId: "question-1",
        chargePersonalQuota: true,
        chargeQuestion: true,
        manualRetry: true,
        inputEstimateTokens: 4,
        outputEstimateTokens: 4,
        occurredAt: 1_003,
      },
      database
    );
    expect(manualRetry.id).not.toBe(first.id);
    expect((await getAssistantQuotaSnapshot(userId, { now: 1_004, database })).questionHour).toBe(
      2
    );

    await expect(
      reserveAiUsage(
        {
          feature: "assistant",
          frontendUserId: userId,
          logicalRequestId: "question-3",
          logicalQuestionId: "question-3",
          chargePersonalQuota: true,
          chargeQuestion: true,
          inputEstimateTokens: 1,
          outputEstimateTokens: 1,
          occurredAt: 1_005,
        },
        database
      )
    ).rejects.toBeInstanceOf(AiQuotaExceededError);
  });

  it("uses provider-reported total tokens for rolling token quotas", async () => {
    const userId = "total-only-user";
    await addUser(userId);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 100,
        tokenWeeklyLimit: 100,
        questionHourlyLimit: 10,
        questionWeeklyLimit: 10,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 1,
      },
      database
    );
    const handle = await reserveAiUsage(
      {
        feature: "assistant",
        frontendUserId: userId,
        chargePersonalQuota: true,
        inputEstimateTokens: 1,
        outputEstimateTokens: 1,
        logicalRequestId: "total-only",
        occurredAt: 10,
      },
      database
    );
    await settleAiUsage(handle, { usage: { total_tokens: 500 }, occurredAt: 10 }, database);
    expect((await getAssistantQuotaSnapshot(userId, { now: 11, database })).tokenHour).toBe(500);
  });

  it("does not charge the question window for a second internal provider step", async () => {
    const userId = "internal-step-user";
    await addUser(userId);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 1_000,
        tokenWeeklyLimit: 1_000,
        questionHourlyLimit: 1,
        questionWeeklyLimit: 1,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 1,
      },
      database
    );
    await reserveAiUsage(
      {
        feature: "assistant",
        frontendUserId: userId,
        logicalRequestId: "internal-step-1",
        logicalQuestionId: "question-1",
        chargePersonalQuota: true,
        chargeQuestion: true,
        inputEstimateTokens: 1,
        occurredAt: 10,
      },
      database
    );
    await expect(
      reserveAiUsage(
        {
          feature: "assistant-retrieval",
          frontendUserId: userId,
          logicalRequestId: "internal-step-2",
          logicalQuestionId: "question-1",
          chargePersonalQuota: true,
          chargeQuestion: true,
          inputEstimateTokens: 1,
          occurredAt: 11,
        },
        database
      )
    ).resolves.toBeDefined();
    expect((await getAssistantQuotaSnapshot(userId, { now: 12, database })).questionHour).toBe(1);
  });

  it("counts a successful provider response even when usage is omitted", async () => {
    await meterProviderCall({
      context: {
        feature: "usage-without-provider-report",
        logicalRequestId: "missing-usage-success",
      },
      call: async () => ({ ok: true }),
      database,
    });
    expect(await database.select().from(aiUsageRecords)).toMatchObject([
      expect.objectContaining({ status: "success", usageComplete: false }),
    ]);
  });

  it("preserves actual partial usage when a later settlement only changes status", async () => {
    const handle = await reserveAiUsage(
      {
        feature: "assistant",
        logicalRequestId: "partial-usage",
        inputEstimateTokens: 10,
        outputEstimateTokens: 10,
        occurredAt: 20,
      },
      database
    );
    await settleAiUsage(handle, { usage: { input_tokens: 300 }, occurredAt: 20 }, database);
    await settleAiUsage(handle, { status: "cancelled", occurredAt: 21 }, database);
    expect(await getAiUsageRecord(handle.id, database)).toMatchObject({
      status: "cancelled",
      inputTokens: 300,
      outputTokens: 10,
      totalTokens: 310,
      usageComplete: false,
    });
  });

  it("charges one question for all provider calls in one manual retry action", async () => {
    const userId = "manual-retry-action-user";
    await addUser(userId);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 1_000,
        tokenWeeklyLimit: 1_000,
        questionHourlyLimit: 10,
        questionWeeklyLimit: 10,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 1,
      },
      database
    );
    await reserveAiUsage(
      {
        feature: "assistant",
        frontendUserId: userId,
        logicalRequestId: "manual-original",
        logicalQuestionId: "question-1",
        chargePersonalQuota: true,
        chargeQuestion: true,
        inputEstimateTokens: 1,
        occurredAt: 10,
      },
      database
    );
    for (const [logicalRequestId, occurredAt] of [
      ["manual-attempt-1", 11],
      ["manual-attempt-2", 12],
    ] as const) {
      await reserveAiUsage(
        {
          feature: "assistant",
          frontendUserId: userId,
          logicalRequestId,
          logicalQuestionId: "question-1",
          manualRetry: true,
          manualRetryId: "retry-action-1",
          chargePersonalQuota: true,
          chargeQuestion: true,
          inputEstimateTokens: 1,
          occurredAt,
        },
        database
      );
    }
    expect((await getAssistantQuotaSnapshot(userId, { now: 13, database })).questionHour).toBe(2);
  });

  it("opens a new reset cycle without rewriting in-flight history", async () => {
    const userId = "reset-user";
    await addUser(userId);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 20,
        tokenWeeklyLimit: 20,
        questionHourlyLimit: 1,
        questionWeeklyLimit: 1,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 1,
      },
      database
    );
    const inFlight = await reserveAiUsage(
      {
        feature: "assistant",
        frontendUserId: userId,
        logicalRequestId: "before-reset",
        logicalQuestionId: "before-reset",
        chargePersonalQuota: true,
        chargeQuestion: true,
        inputEstimateTokens: 10,
        outputEstimateTokens: 0,
        occurredAt: 10,
      },
      database
    );
    await resetAssistantQuota(userId, "manual", { now: 20, database });
    const afterReset = await reserveAiUsage(
      {
        feature: "assistant",
        frontendUserId: userId,
        logicalRequestId: "after-reset",
        logicalQuestionId: "after-reset",
        chargePersonalQuota: true,
        chargeQuestion: true,
        inputEstimateTokens: 10,
        outputEstimateTokens: 0,
        occurredAt: 21,
      },
      database
    );
    expect((await getAssistantQuotaSnapshot(userId, { now: 22, database })).questionHour).toBe(1);
    await settleAiUsage(inFlight, { usage: { input_tokens: 10, output_tokens: 0 } }, database);
    expect((await getAssistantQuotaSnapshot(userId, { now: 23, database })).questionHour).toBe(1);
    expect(afterReset.id).not.toBe(inFlight.id);
  });

  it("serializes concurrent settlement and keeps a complete correction", async () => {
    const handle = await reserveAiUsage(
      {
        feature: "assistant",
        logicalRequestId: "concurrent-settlement",
        inputEstimateTokens: 10,
        outputEstimateTokens: 10,
        occurredAt: 100,
      },
      database
    );
    await Promise.all([
      settleAiUsage(handle, { status: "missing", occurredAt: 101 }, database),
      settleAiUsage(
        handle,
        { usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 }, occurredAt: 102 },
        database
      ),
    ]);
    expect(await getAiUsageRecord(handle.id, database)).toMatchObject({
      status: "success",
      totalTokens: 5,
      usageComplete: true,
      estimated: false,
    });
  });

  it("preserves failure and cancellation status during a later usage correction", async () => {
    const failure = await reserveAiUsage(
      { feature: "assistant", logicalRequestId: "status-failure", occurredAt: 100 },
      database
    );
    await settleAiUsage(failure, { status: "failure" }, database);
    await settleAiUsage(
      failure,
      { usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } },
      database
    );

    const cancelled = await reserveAiUsage(
      { feature: "assistant", logicalRequestId: "status-cancelled", occurredAt: 101 },
      database
    );
    await settleAiUsage(cancelled, { status: "cancelled" }, database);
    await settleAiUsage(
      cancelled,
      { usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } },
      database
    );

    expect(await getAiUsageRecord(failure.id, database)).toMatchObject({
      status: "failure",
      totalTokens: 3,
      usageComplete: true,
    });
    expect(await getAiUsageRecord(cancelled.id, database)).toMatchObject({
      status: "cancelled",
      totalTokens: 3,
      usageComplete: true,
    });
  });

  it("does not suppress a new question after the weekly window", async () => {
    const userId = "window-question-user";
    await addUser(userId);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 1_000,
        tokenWeeklyLimit: 1_000,
        questionHourlyLimit: 2,
        questionWeeklyLimit: 2,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 1,
      },
      database
    );
    await reserveAiUsage(
      {
        feature: "assistant",
        frontendUserId: userId,
        logicalRequestId: "old-question",
        logicalQuestionId: "reused-client-id",
        chargePersonalQuota: true,
        chargeQuestion: true,
        inputEstimateTokens: 1,
        outputEstimateTokens: 1,
        occurredAt: 1,
      },
      database
    );
    await reserveAiUsage(
      {
        feature: "assistant",
        frontendUserId: userId,
        logicalRequestId: "new-question",
        logicalQuestionId: "reused-client-id",
        chargePersonalQuota: true,
        chargeQuestion: true,
        inputEstimateTokens: 1,
        outputEstimateTokens: 1,
        occurredAt: 7 * 24 * 60 * 60 * 1_000 + 2,
      },
      database
    );
    expect(
      (
        await getAssistantQuotaSnapshot(userId, {
          now: 7 * 24 * 60 * 60 * 1_000 + 3,
          database,
        })
      ).questionWeek
    ).toBe(1);
  });

  it("does not quota-charge administrators or non-assistant sitewide calls", async () => {
    const userId = "admin-metering-user";
    await addUser(userId);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 0,
        tokenWeeklyLimit: 0,
        questionHourlyLimit: 0,
        questionWeeklyLimit: 0,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 1,
      },
      database
    );
    await expect(
      reserveAiUsage(
        {
          feature: "tag-organization",
          frontendUserId: userId,
          isAdmin: true,
          inputEstimateTokens: 4,
          occurredAt: 2,
        },
        database
      )
    ).resolves.toBeDefined();
    await expect(
      reserveAiUsage(
        {
          feature: "search-suggestions",
          frontendUserId: userId,
          inputEstimateTokens: 4,
          occurredAt: 3,
        },
        database
      )
    ).resolves.toBeDefined();
  });

  it("uses the persisted frontend admin flag as a quota bypass", async () => {
    const userId = "persisted-admin-user";
    await addUser(userId, true);
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 0,
        tokenWeeklyLimit: 0,
        questionHourlyLimit: 0,
        questionWeeklyLimit: 0,
        maxConversations: 3,
        retentionMs: 1_000,
        timezone: "UTC",
        now: 1,
      },
      database
    );
    await expect(
      reserveAiUsage(
        {
          feature: "assistant",
          frontendUserId: userId,
          chargePersonalQuota: true,
          chargeQuestion: true,
          inputEstimateTokens: 4,
          occurredAt: 2,
        },
        database
      )
    ).resolves.toBeDefined();
  });

  it("enforces three active conversations for ordinary users", async () => {
    const userId = "conversation-limit-user";
    await addUser(userId);
    for (let index = 0; index < 3; index++) {
      await database.insert(assistantConversations).values({
        id: `conversation-limit-${index}`,
        frontendUserId: userId,
        kind: "general",
        title: null,
        clippingMemoId: null,
        clippingVersionId: null,
        status: "active",
        createdAt: index,
        lastUserMessageAt: index,
        expiresAt: 10_000,
        deletedAt: null,
      });
    }
    await expect(
      assertAssistantConversationQuota(userId, { now: 100, database })
    ).rejects.toMatchObject({
      dimension: "conversations",
    });

    const adminId = "conversation-limit-admin";
    await addUser(adminId, true);
    for (let index = 0; index < 3; index++) {
      await database.insert(assistantConversations).values({
        id: `conversation-limit-admin-${index}`,
        frontendUserId: adminId,
        kind: "general",
        title: null,
        clippingMemoId: null,
        clippingVersionId: null,
        status: "active",
        createdAt: index,
        lastUserMessageAt: index,
        expiresAt: 10_000,
        deletedAt: null,
      });
    }
    await expect(
      assertAssistantConversationQuota(adminId, { now: 100, database })
    ).resolves.toMatchObject({ activeCount: 3, maxConversations: 3 });
  });

  it("rolls up usage idempotently and keeps summaries after detail cleanup", async () => {
    const day = "2026-01-01";
    const first = await reserveAiUsage(
      {
        feature: "search-embedding",
        provider: "openai-compatible",
        model: "embed-model",
        logicalRequestId: "rollup-first",
        inputEstimateTokens: 10,
        outputEstimateTokens: 0,
        occurredAt: Date.parse(`${day}T01:00:00Z`),
      },
      database
    );
    await settleAiUsage(first, { usage: { prompt_tokens: 10, total_tokens: 10 } }, database);
    await reserveAiUsage(
      {
        feature: "search-embedding",
        provider: "openai-compatible",
        model: "embed-model",
        logicalRequestId: "rollup-missing",
        inputEstimateTokens: 10,
        outputEstimateTokens: 0,
        occurredAt: Date.parse(`${day}T02:00:00Z`),
      },
      database
    );

    await rollupAiUsageDay({
      day,
      timezone: "UTC",
      now: Date.parse("2026-01-02T00:00:00Z"),
      database,
    });
    await rollupAiUsageDay({
      day,
      timezone: "UTC",
      now: Date.parse("2026-01-02T01:00:00Z"),
      database,
    });
    const summaries = await database.select().from(aiUsageDailySummaries);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ callCount: 2, totalTokens: 20, incompleteCallCount: 1 });

    await database.delete(aiUsageRecords).where(eq(aiUsageRecords.id, first.id));
    await rollupAiUsageDay({
      day,
      timezone: "UTC",
      now: Date.parse("2026-01-03T00:00:00Z"),
      database,
    });
    expect(await database.select().from(aiUsageDailySummaries)).toMatchObject([
      expect.objectContaining({ callCount: 2, totalTokens: 20 }),
    ]);

    const cleanup = await cleanupAiUsageDetails({
      now: Date.parse("2026-04-03T00:00:00Z"),
      database,
    });
    expect(cleanup.deleted).toBe(1);
    expect(await database.select().from(aiUsageDailySummaries)).toHaveLength(1);
  });

  it("rolls up result counts and keeps them when detail rows are cleaned", async () => {
    const day = "2026-01-01";
    const success = await reserveAiUsage(
      {
        feature: "assistant",
        logicalRequestId: "result-success",
        occurredAt: Date.parse(`${day}T01:00:00Z`),
      },
      database
    );
    await settleAiUsage(
      success,
      { usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } },
      database
    );
    const failure = await reserveAiUsage(
      {
        feature: "assistant",
        logicalRequestId: "result-failure",
        occurredAt: Date.parse(`${day}T02:00:00Z`),
      },
      database
    );
    await settleAiUsage(
      failure,
      { status: "failure", usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } },
      database
    );
    const cancelled = await reserveAiUsage(
      {
        feature: "assistant",
        logicalRequestId: "result-cancelled",
        occurredAt: Date.parse(`${day}T03:00:00Z`),
      },
      database
    );
    await settleAiUsage(
      cancelled,
      { status: "cancelled", usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } },
      database
    );
    const successWithoutUsage = await reserveAiUsage(
      {
        feature: "assistant",
        logicalRequestId: "result-success-without-usage",
        occurredAt: Date.parse(`${day}T04:00:00Z`),
      },
      database
    );
    await settleAiUsage(successWithoutUsage, { status: "success" }, database);

    await rollupAiUsageDay({
      day,
      timezone: "UTC",
      now: Date.parse("2026-01-02T00:00:00Z"),
      database,
    });
    expect(await database.select().from(aiUsageDailySummaries)).toMatchObject([
      expect.objectContaining({
        callCount: 4,
        successCallCount: 2,
        failureCallCount: 1,
        cancelledCallCount: 1,
      }),
    ]);
    await rollupAiUsageDay({
      day,
      timezone: "UTC",
      now: Date.parse("2026-01-02T01:00:00Z"),
      database,
    });
    await cleanupAiUsageDetails({ now: Date.parse("2026-04-03T00:00:00Z"), database });
    expect(await database.select().from(aiUsageRecords)).toHaveLength(0);
    expect(await database.select().from(aiUsageDailySummaries)).toMatchObject([
      expect.objectContaining({
        callCount: 4,
        successCallCount: 2,
        failureCallCount: 1,
        cancelledCallCount: 1,
      }),
    ]);
  });

  it("removes a stale summary dimension after settlement resolves the model", async () => {
    const day = "2026-01-01";
    const handle = await reserveAiUsage(
      {
        feature: "search-embedding",
        provider: "openai-compatible",
        model: null,
        logicalRequestId: "dimension-correction",
        inputEstimateTokens: 4,
        outputEstimateTokens: 1,
        occurredAt: Date.parse(`${day}T01:00:00Z`),
      },
      database
    );
    await rollupAiUsageDay({
      day,
      timezone: "UTC",
      now: Date.parse("2026-01-02T00:00:00Z"),
      database,
    });
    await settleAiUsage(
      handle,
      {
        provider: "openai-compatible",
        model: "resolved-embedding-model",
        usage: { input_tokens: 4, output_tokens: 1, total_tokens: 5 },
      },
      database
    );
    await rollupAiUsageDay({
      day,
      timezone: "UTC",
      now: Date.parse("2026-01-02T01:00:00Z"),
      database,
    });
    expect(await database.select().from(aiUsageDailySummaries)).toMatchObject([
      expect.objectContaining({ model: "resolved-embedding-model", callCount: 1 }),
    ]);
    expect(await database.select().from(aiUsageDailySummaries)).toHaveLength(1);
  });

  it("keeps an existing summary created before result-count columns were added", async () => {
    await database.insert(aiUsageDailySummaries).values({
      id: "legacy-summary",
      day: "2026-01-01",
      timezone: "UTC",
      frontendUserId: null,
      feature: "assistant",
      provider: null,
      model: null,
      callCount: 1,
      inputTokens: 2,
      cachedInputTokens: 0,
      outputTokens: 1,
      reasoningTokens: 0,
      totalTokens: 3,
      estimatedCallCount: 0,
      incompleteCallCount: 0,
      updatedAt: Date.parse("2026-01-02T00:00:00Z"),
    });
    await rollupAiUsageDay({
      day: "2026-01-01",
      timezone: "UTC",
      now: Date.parse("2026-01-03T00:00:00Z"),
      database,
    });
    expect(await database.select().from(aiUsageDailySummaries)).toMatchObject([
      expect.objectContaining({
        callCount: 1,
        successCallCount: 0,
        failureCallCount: 0,
        cancelledCallCount: 0,
      }),
    ]);
  });

  it("rolls every retained detail day before deleting old records", async () => {
    const oldDay = Date.parse("2026-01-01T01:00:00Z");
    const secondOldDay = Date.parse("2026-01-02T01:00:00Z");
    for (const [requestId, occurredAt] of [
      ["maintenance-1", oldDay],
      ["maintenance-2", oldDay + 3_600_000],
      ["maintenance-3", secondOldDay],
    ] as const) {
      const handle = await reserveAiUsage(
        { feature: "assistant", logicalRequestId: requestId, inputEstimateTokens: 4, occurredAt },
        database
      );
      await settleAiUsage(handle, { usage: { input_tokens: 4, output_tokens: 1 } }, database);
    }
    const result = await runAiUsageMaintenance({
      now: Date.parse("2026-04-03T12:00:00Z"),
      timezone: "UTC",
      database,
    });
    expect(result.rollup.day).toBe("2026-04-02");
    expect(result.rollups.map((entry) => entry.day)).toContain("2026-01-01");
    expect(result.rollups.map((entry) => entry.day)).toContain("2026-01-02");
    expect(result.cleanup.deleted).toBe(3);
    expect(await database.select().from(aiUsageDailySummaries)).toMatchObject([
      expect.objectContaining({ day: "2026-01-01", callCount: 2, totalTokens: 10 }),
      expect.objectContaining({ day: "2026-01-02", callCount: 1, totalTokens: 5 }),
    ]);
  });

  it("chooses the previous calendar day across DST transitions", async () => {
    const result = await rollupAiUsageDay({
      timezone: "America/New_York",
      now: Date.parse("2026-03-09T03:30:00Z"),
      database,
    });
    expect(result.day).toBe("2026-03-07");
  });
});
