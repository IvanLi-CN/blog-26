import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { setAssistantQuotaPolicy } from "@/lib/ai-usage";
import * as schema from "@/lib/schema";
import {
  getAdminAiUsageOverview,
  listAdminUsers,
  resetAdminUserQuota,
  resolveAdminUsageRange,
} from "@/server/services/admin-ai-usage";

const sqlite = new Database(":memory:");
const database = drizzle(sqlite, { schema });
const now = Date.parse("2026-10-27T04:00:00.000Z");

describe("admin AI usage service", () => {
  beforeAll(() => migrate(database, { migrationsFolder: path.resolve("drizzle") }));

  beforeEach(async () => {
    await database.delete(schema.aiUsageDailySummaries);
    await database.delete(schema.aiUsageRecords);
    await database.delete(schema.assistantQuotaResets);
    await database.delete(schema.assistantQuotaPolicies);
    await database.delete(schema.frontendUsers);
    await database.insert(schema.frontendUsers).values({
      id: "user-1",
      adminUserId: null,
      isAdmin: false,
      displayName: "Reader One",
      email: "reader@example.com",
      avatarUrl: "/avatar.svg",
      profileUrl: null,
      createdAt: now - 100_000,
      updatedAt: now - 100_000,
    });
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 100,
        tokenWeeklyLimit: 500,
        questionHourlyLimit: 10,
        questionWeeklyLimit: 30,
        maxConversations: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        timezone: "Asia/Shanghai",
        now,
      },
      database
    );
  });

  afterAll(() => sqlite.close());

  it("uses current detail rows once and falls back to old daily summaries", async () => {
    await database.insert(schema.aiUsageRecords).values([
      {
        id: "detail-success",
        frontendUserId: "user-1",
        conversationId: null,
        generationJobId: null,
        feature: "assistant",
        provider: "openai-compatible",
        model: "demo-model",
        status: "success",
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 40,
        reasoningTokens: 0,
        totalTokens: 140,
        estimated: false,
        usageComplete: true,
        idempotencyKey: "detail-success-key",
        occurredAt: now - 60_000,
        createdAt: now - 60_000,
        rawUsage: JSON.stringify({
          quota: { personal: true, chargeQuestion: true, cycleId: "initial" },
        }),
      },
      {
        id: "detail-missing",
        frontendUserId: "user-1",
        conversationId: null,
        generationJobId: null,
        feature: "search",
        provider: "openai-compatible",
        model: "demo-model",
        status: "missing",
        inputTokens: 20,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        totalTokens: 20,
        estimated: true,
        usageComplete: false,
        idempotencyKey: "detail-missing-key",
        occurredAt: now - 120_000,
        createdAt: now - 120_000,
        rawUsage: null,
      },
    ]);
    await database.insert(schema.aiUsageDailySummaries).values({
      id: "old-summary",
      day: "2026-07-01",
      timezone: "Asia/Shanghai",
      frontendUserId: "user-1",
      feature: "assistant",
      provider: "openai-compatible",
      model: "demo-model",
      callCount: 3,
      inputTokens: 300,
      cachedInputTokens: 50,
      outputTokens: 120,
      reasoningTokens: 0,
      totalTokens: 420,
      estimatedCallCount: 0,
      incompleteCallCount: 0,
      successCallCount: 3,
      failureCallCount: 0,
      cancelledCallCount: 0,
      updatedAt: now,
    });

    const current = await getAdminAiUsageOverview({
      range: "7d",
      groupBy: "feature",
      now,
      database,
    });
    expect(current.metric).toMatchObject({
      callCount: 2,
      inputTokens: 120,
      cachedInputTokens: 20,
      outputTokens: 40,
      missingCallCount: 1,
    });
    expect(current.details).toHaveLength(2);
    expect(current.trend).toHaveLength(7);
    expect(current.retention.rangeCoverage).toBe("detail");

    const longRange = await getAdminAiUsageOverview({
      range: "365d",
      groupBy: "user",
      now,
      database,
    });
    expect(longRange.metric.callCount).toBe(5);
    expect(longRange.metric.totalTokens).toBe(580);
    expect(longRange.details).toHaveLength(2);
    expect(longRange.retention.rangeCoverage).toBe("mixed");

    const filtered = await getAdminAiUsageOverview({
      range: "7d",
      filters: { status: "missing" },
      now,
      database,
    });
    expect(filtered.metric.callCount).toBe(1);
    expect(filtered.details[0]?.status).toBe("missing");
  });

  it("lists site-wide user totals separately from personal quota and resets one cycle", async () => {
    await database.insert(schema.aiUsageRecords).values({
      id: "user-total",
      frontendUserId: "user-1",
      conversationId: null,
      generationJobId: null,
      feature: "assistant",
      provider: "openai-compatible",
      model: "demo-model",
      status: "success",
      inputTokens: 30,
      cachedInputTokens: 0,
      outputTokens: 20,
      reasoningTokens: 0,
      totalTokens: 50,
      estimated: false,
      usageComplete: true,
      idempotencyKey: "user-total-key",
      occurredAt: now - 10_000,
      createdAt: now - 10_000,
      rawUsage: JSON.stringify({
        version: 1,
        providerCall: true,
        lifecycle: "settled",
        logicalRequestId: "user-total-request",
        logicalQuestionId: "user-total-question",
        manualRetryId: null,
        automaticRetry: false,
        manualRetry: false,
        attempt: 1,
        quota: {
          personal: true,
          chargeQuestion: true,
          cycleId: "initial",
          tokenReservation: 50,
        },
        reservation: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
        containment: { parentUsageId: null, logicalRequestId: "user-total-request" },
        settlement: { status: "success", usageComplete: true, estimated: false },
      }),
    });
    const listed = await listAdminUsers({ now, database });
    expect(listed.users[0]?.usage.allTime.totalTokens).toBe(50);
    expect(listed.users[0]?.quotaStatus).toBe("available");
    expect(listed.users[0]?.quota.tokenHour).toBe(50);

    const reset = await resetAdminUserQuota("user-1", { now, database });
    expect(reset?.quota.cycleId).not.toBe("initial");
    expect(await database.select().from(schema.aiUsageRecords)).toHaveLength(1);
    expect(await database.select().from(schema.assistantQuotaResets)).toHaveLength(1);
    const afterReset = await listAdminUsers({ now, database });
    expect(afterReset.users[0]?.quota.tokenHour).toBe(0);
    expect(afterReset.users[0]?.usage.allTime.totalTokens).toBe(50);
  });

  it("keeps summary totals for a partially retained boundary day and uses product timezone", async () => {
    const boundary = now - 90 * 24 * 60 * 60 * 1_000;
    const boundaryDay = "2026-07-29";
    await database.insert(schema.aiUsageDailySummaries).values({
      id: "boundary-summary",
      day: boundaryDay,
      timezone: "Asia/Shanghai",
      frontendUserId: "user-1",
      feature: "assistant",
      provider: "openai-compatible",
      model: "demo-model",
      callCount: 2,
      inputTokens: 200,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 200,
      estimatedCallCount: 0,
      incompleteCallCount: 0,
      successCallCount: 2,
      failureCallCount: 0,
      cancelledCallCount: 0,
      updatedAt: now,
    });
    await database.insert(schema.aiUsageRecords).values({
      id: "boundary-detail",
      frontendUserId: "user-1",
      conversationId: null,
      generationJobId: null,
      feature: "assistant",
      provider: "openai-compatible",
      model: "demo-model",
      status: "success",
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 100,
      estimated: false,
      usageComplete: true,
      idempotencyKey: "boundary-detail-key",
      occurredAt: boundary + 60_000,
      createdAt: boundary + 60_000,
      rawUsage: null,
    });
    await setAssistantQuotaPolicy(
      {
        tokenHourlyLimit: 100,
        tokenWeeklyLimit: 500,
        questionHourlyLimit: 10,
        questionWeeklyLimit: 30,
        maxConversations: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        timezone: "UTC",
        now,
      },
      database
    );
    const overview = await getAdminAiUsageOverview({ range: "365d", now, database });
    expect(overview.timezone).toBe("Asia/Shanghai");
    expect(overview.metric.callCount).toBe(2);
    expect(overview.metric.totalTokens).toBe(200);

    const boundaryFiltered = await getAdminAiUsageOverview({
      range: "custom",
      from: boundaryDay,
      to: "2026-10-27",
      filters: { status: "success" },
      now,
      database,
    });
    expect(boundaryFiltered.retention.resultFilterCoverage).toBe("summary");
  });

  it("rejects impossible custom calendar dates", () => {
    expect(() =>
      resolveAdminUsageRange({
        range: "custom",
        from: "2026-02-30",
        to: "2026-03-01",
        timezone: "Asia/Shanghai",
        now,
      })
    ).toThrow("Invalid AI usage date range");
  });

  it("reports when the retained detail list is truncated", async () => {
    await database.insert(schema.aiUsageRecords).values(
      Array.from({ length: 501 }, (_, index) => ({
        id: `detail-${index}`,
        frontendUserId: "user-1",
        conversationId: null,
        generationJobId: null,
        feature: "assistant",
        provider: "openai-compatible",
        model: "demo-model",
        status: "success" as const,
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 5,
        reasoningTokens: 0,
        totalTokens: 15,
        estimated: false,
        usageComplete: true,
        idempotencyKey: `detail-key-${index}`,
        occurredAt: now - index,
        createdAt: now - index,
        rawUsage: null,
      }))
    );
    const overview = await getAdminAiUsageOverview({ range: "7d", now, database });
    expect(overview.detailTotal).toBe(501);
    expect(overview.details).toHaveLength(500);
    expect(overview.detailsTruncated).toBe(true);
  });
});
