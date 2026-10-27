import { and, asc, desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type {
  AppendAssistantMessageInput,
  AssistantConversation,
  AssistantGenerationJob,
  AssistantMessage,
  AssistantMessageStorage,
  CreateAssistantConversationInput,
  CreateAssistantGenerationJobInput,
  UpdateAssistantGenerationJobInput,
} from "@/lib/assistant-contracts";
import { DEFAULT_ASSISTANT_QUOTA_POLICY } from "@/lib/assistant-contracts";
import { db, initializeDB } from "@/lib/db";
import { assistantConversations, assistantGenerationJobs, assistantMessages } from "@/lib/schema";

type AssistantDatabase = NonNullable<typeof db>;

async function database(): Promise<AssistantDatabase> {
  if (!db) await initializeDB();
  if (!db) throw new Error("Database has not been initialized");
  return db;
}

function mapConversation(row: typeof assistantConversations.$inferSelect): AssistantConversation {
  return {
    id: row.id,
    frontendUserId: row.frontendUserId,
    kind: row.kind,
    title: row.title,
    clippingMemoId: row.clippingMemoId,
    clippingVersionId: row.clippingVersionId,
    status: row.status,
    createdAt: row.createdAt,
    lastUserMessageAt: row.lastUserMessageAt,
    expiresAt: row.expiresAt,
    deletedAt: row.deletedAt,
  };
}

function mapMessage(row: typeof assistantMessages.$inferSelect): AssistantMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sequence: row.sequence,
    role: row.role,
    content: row.content,
    status: row.status,
    clientRequestId: row.clientRequestId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

function mapGenerationJob(
  row: typeof assistantGenerationJobs.$inferSelect
): AssistantGenerationJob {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userMessageId: row.userMessageId,
    assistantMessageId: row.assistantMessageId,
    requestId: row.requestId,
    status: row.status,
    attempt: row.attempt,
    leaseUntil: row.leaseUntil,
    cancelRequested: row.cancelRequested,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createAssistantStorage(
  databaseOverride?: AssistantDatabase
): AssistantMessageStorage {
  const getDatabase = async () => databaseOverride ?? database();

  return {
    async createConversation(input: CreateAssistantConversationInput) {
      const database = await getDatabase();
      const now = input.now ?? Date.now();
      const row = {
        id: input.id ?? uuidv4(),
        frontendUserId: input.frontendUserId,
        kind: input.kind ?? "general",
        title: input.title ?? null,
        clippingMemoId: input.clippingMemoId ?? null,
        clippingVersionId: input.clippingVersionId ?? null,
        status: "active" as const,
        createdAt: now,
        lastUserMessageAt: null,
        expiresAt: null,
        deletedAt: null,
      } satisfies typeof assistantConversations.$inferInsert;
      await database.insert(assistantConversations).values(row);
      return mapConversation(row as typeof assistantConversations.$inferSelect);
    },

    async getConversation(conversationId: string, frontendUserId: string) {
      const database = await getDatabase();
      const row = await database
        .select()
        .from(assistantConversations)
        .where(eq(assistantConversations.id, conversationId))
        .get();
      return row && row.frontendUserId === frontendUserId ? mapConversation(row) : null;
    },

    async listConversations(frontendUserId: string) {
      const database = await getDatabase();
      const rows = await database
        .select()
        .from(assistantConversations)
        .where(eq(assistantConversations.frontendUserId, frontendUserId))
        .orderBy(desc(assistantConversations.createdAt))
        .all();
      return rows.filter((row) => row.deletedAt === null).map(mapConversation);
    },

    async appendMessage(input: AppendAssistantMessageInput) {
      const database = await getDatabase();
      const now = input.now ?? Date.now();
      return database.transaction(
        (tx) => {
          const conversation = tx
            .select({ id: assistantConversations.id })
            .from(assistantConversations)
            .where(
              and(
                eq(assistantConversations.id, input.conversationId),
                eq(assistantConversations.frontendUserId, input.frontendUserId)
              )
            )
            .get();
          if (!conversation)
            throw new Error("Assistant conversation is not owned by frontend user");
          if (input.clientRequestId) {
            const existing = tx
              .select()
              .from(assistantMessages)
              .where(
                and(
                  eq(assistantMessages.conversationId, input.conversationId),
                  eq(assistantMessages.clientRequestId, input.clientRequestId)
                )
              )
              .get();
            if (existing) return mapMessage(existing);
          }
          const latest = tx
            .select({ sequence: assistantMessages.sequence })
            .from(assistantMessages)
            .where(eq(assistantMessages.conversationId, input.conversationId))
            .orderBy(desc(assistantMessages.sequence))
            .limit(1)
            .get();
          const row = {
            id: input.id ?? uuidv4(),
            conversationId: input.conversationId,
            sequence: input.sequence ?? (latest?.sequence ?? 0) + 1,
            role: input.role,
            content: input.content,
            status: input.status ?? "completed",
            clientRequestId: input.clientRequestId ?? null,
            createdAt: now,
            updatedAt: now,
            completedAt: input.status === "completed" || !input.status ? now : null,
          } satisfies typeof assistantMessages.$inferInsert;
          tx.insert(assistantMessages).values(row).run();
          if (input.role === "user") {
            tx.update(assistantConversations)
              .set({
                lastUserMessageAt: now,
                expiresAt: now + DEFAULT_ASSISTANT_QUOTA_POLICY.retentionMs,
              })
              .where(eq(assistantConversations.id, input.conversationId))
              .run();
          }
          return mapMessage(row as typeof assistantMessages.$inferSelect);
        },
        { behavior: "immediate" }
      );
    },

    async listMessages(conversationId: string, frontendUserId: string) {
      const database = await getDatabase();
      const conversation = await database
        .select({ id: assistantConversations.id })
        .from(assistantConversations)
        .where(
          and(
            eq(assistantConversations.id, conversationId),
            eq(assistantConversations.frontendUserId, frontendUserId)
          )
        )
        .get();
      if (!conversation) return [];
      const rows = await database
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.conversationId, conversationId))
        .orderBy(asc(assistantMessages.sequence))
        .all();
      return rows.map(mapMessage);
    },

    async createGenerationJob(input: CreateAssistantGenerationJobInput) {
      const database = await getDatabase();
      const now = input.now ?? Date.now();
      return database.transaction(
        (tx) => {
          const conversation = tx
            .select({ id: assistantConversations.id })
            .from(assistantConversations)
            .where(
              and(
                eq(assistantConversations.id, input.conversationId),
                eq(assistantConversations.frontendUserId, input.frontendUserId)
              )
            )
            .get();
          if (!conversation)
            throw new Error("Assistant conversation is not owned by frontend user");

          if (input.userMessageId) {
            const userMessage = tx
              .select({
                conversationId: assistantMessages.conversationId,
                role: assistantMessages.role,
              })
              .from(assistantMessages)
              .where(eq(assistantMessages.id, input.userMessageId))
              .get();
            if (
              !userMessage ||
              userMessage.conversationId !== input.conversationId ||
              userMessage.role !== "user"
            ) {
              throw new Error(
                "Assistant user message must belong to the conversation and use role user"
              );
            }
          }

          if (input.assistantMessageId) {
            const assistantMessage = tx
              .select({
                conversationId: assistantMessages.conversationId,
                role: assistantMessages.role,
              })
              .from(assistantMessages)
              .where(eq(assistantMessages.id, input.assistantMessageId))
              .get();
            if (
              !assistantMessage ||
              assistantMessage.conversationId !== input.conversationId ||
              assistantMessage.role !== "assistant"
            ) {
              throw new Error(
                "Assistant response message must belong to the conversation and use role assistant"
              );
            }
          }

          const row = {
            id: input.id ?? uuidv4(),
            conversationId: input.conversationId,
            userMessageId: input.userMessageId ?? null,
            assistantMessageId: input.assistantMessageId ?? null,
            requestId: input.requestId,
            status: "queued" as const,
            attempt: 1,
            leaseUntil: null,
            cancelRequested: false,
            startedAt: null,
            finishedAt: null,
            errorCode: null,
            createdAt: now,
            updatedAt: now,
          } satisfies typeof assistantGenerationJobs.$inferInsert;
          tx.insert(assistantGenerationJobs).values(row).run();
          return mapGenerationJob(row as typeof assistantGenerationJobs.$inferSelect);
        },
        { behavior: "immediate" }
      );
    },

    async getGenerationJob(generationJobId: string, frontendUserId: string) {
      const database = await getDatabase();
      const row = await database
        .select({ job: assistantGenerationJobs, ownerId: assistantConversations.frontendUserId })
        .from(assistantGenerationJobs)
        .innerJoin(
          assistantConversations,
          eq(assistantGenerationJobs.conversationId, assistantConversations.id)
        )
        .where(eq(assistantGenerationJobs.id, generationJobId))
        .get();
      return row && row.ownerId === frontendUserId ? mapGenerationJob(row.job) : null;
    },

    async updateGenerationJob(
      generationJobId: string,
      frontendUserId: string,
      input: UpdateAssistantGenerationJobInput
    ) {
      const database = await getDatabase();
      const current = await database
        .select({ job: assistantGenerationJobs, ownerId: assistantConversations.frontendUserId })
        .from(assistantGenerationJobs)
        .innerJoin(
          assistantConversations,
          eq(assistantGenerationJobs.conversationId, assistantConversations.id)
        )
        .where(eq(assistantGenerationJobs.id, generationJobId))
        .get();
      if (!current || current.ownerId !== frontendUserId) return null;
      const now = input.updatedAt ?? Date.now();
      await database
        .update(assistantGenerationJobs)
        .set({
          status: input.status,
          attempt: input.attempt,
          leaseUntil: input.leaseUntil,
          cancelRequested: input.cancelRequested,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          errorCode: input.errorCode,
          updatedAt: now,
        })
        .where(eq(assistantGenerationJobs.id, generationJobId));
      const updated = await database
        .select()
        .from(assistantGenerationJobs)
        .where(eq(assistantGenerationJobs.id, generationJobId))
        .get();
      return updated ? mapGenerationJob(updated) : null;
    },
  };
}
