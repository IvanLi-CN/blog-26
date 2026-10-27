import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type {
  AppendAssistantMessageInput,
  AssistantCitation,
  AssistantConversation,
  AssistantGenerationJob,
  AssistantJobExecution,
  AssistantMessage,
  AssistantMessageStorage,
  AssistantTurnSubmission,
  CreateAssistantConversationInput,
  CreateAssistantGenerationJobInput,
  SubmitAssistantTurnInput,
  UpdateAssistantGenerationJobInput,
} from "@/lib/assistant-contracts";
import { DEFAULT_ASSISTANT_QUOTA_POLICY } from "@/lib/assistant-contracts";
import { db, initializeDB } from "@/lib/db";
import {
  assistantConversations,
  assistantGenerationJobs,
  assistantMessageCitations,
  assistantMessages,
  assistantQuotaPolicies,
  frontendUsers,
} from "@/lib/schema";

export type AssistantStorageErrorCode = "not-found" | "gone" | "conflict" | "quota";

export const MAX_ASSISTANT_CONVERSATION_MESSAGES = 200;
export const MAX_ASSISTANT_CONVERSATION_BYTES = 2 * 1024 * 1024;

export class AssistantStorageError extends Error {
  constructor(
    readonly code: AssistantStorageErrorCode,
    message = `Assistant storage error: ${code}`
  ) {
    super(message);
    this.name = "AssistantStorageError";
  }
}

export type AssistantDatabase = NonNullable<typeof db>;
type AssistantQueryDatabase = Pick<AssistantDatabase, "select" | "update" | "delete">;

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

function mapCitation(row: typeof assistantMessageCitations.$inferSelect): AssistantCitation {
  return {
    id: row.id,
    messageId: row.messageId,
    source: row.source,
    sourceId: row.sourceId,
    sourceType: row.sourceType,
    slug: row.slug,
    title: row.title,
    href: row.href,
    location: row.location,
    snippet: row.snippet,
    createdAt: row.createdAt,
  };
}

function mapMessage(
  row: typeof assistantMessages.$inferSelect,
  citations: AssistantCitation[] = []
): AssistantMessage {
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
    citations,
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

function assistantPolicy(database: Pick<AssistantDatabase, "select">, now: number) {
  const row = database
    .select()
    .from(assistantQuotaPolicies)
    .where(eq(assistantQuotaPolicies.scope, "global"))
    .get();
  return (
    row ?? {
      id: "default",
      scope: "global" as const,
      ...DEFAULT_ASSISTANT_QUOTA_POLICY,
      createdAt: now,
      updatedAt: now,
    }
  );
}

function citationMap(
  rows: Array<typeof assistantMessageCitations.$inferSelect>
): Map<string, AssistantCitation[]> {
  const result = new Map<string, AssistantCitation[]>();
  for (const row of rows) {
    const values = result.get(row.messageId) ?? [];
    values.push(mapCitation(row));
    result.set(row.messageId, values);
  }
  return result;
}

function mapMessages(
  rows: Array<typeof assistantMessages.$inferSelect>,
  citations: Array<typeof assistantMessageCitations.$inferSelect> = []
) {
  const byMessage = citationMap(citations);
  return rows.map((row) => mapMessage(row, byMessage.get(row.id) ?? []));
}

function setConversationTerminal(
  tx: AssistantQueryDatabase,
  conversationId: string,
  status: "expired" | "deleted",
  now: number
) {
  tx.update(assistantGenerationJobs)
    .set({
      status: "cancelled",
      cancelRequested: true,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
      errorCode: status === "expired" ? "conversation-expired" : "conversation-deleted",
    })
    .where(
      and(
        eq(assistantGenerationJobs.conversationId, conversationId),
        inArray(assistantGenerationJobs.status, ["queued", "running"])
      )
    )
    .run();
  tx.update(assistantGenerationJobs)
    .set({ userMessageId: null, assistantMessageId: null })
    .where(eq(assistantGenerationJobs.conversationId, conversationId))
    .run();
  const messageIds = tx
    .select({ id: assistantMessages.id })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .all()
    .map((row) => row.id);
  if (messageIds.length > 0) {
    tx.delete(assistantMessageCitations)
      .where(inArray(assistantMessageCitations.messageId, messageIds))
      .run();
  }
  tx.delete(assistantMessages).where(eq(assistantMessages.conversationId, conversationId)).run();
  tx.update(assistantConversations)
    .set({ status, deletedAt: status === "deleted" ? now : null })
    .where(eq(assistantConversations.id, conversationId))
    .run();
}

function selectConversation(
  tx: AssistantQueryDatabase,
  conversationId: string,
  frontendUserId: string
) {
  return tx
    .select()
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, conversationId),
        eq(assistantConversations.frontendUserId, frontendUserId)
      )
    )
    .get();
}

function selectExecutionRows(database: AssistantQueryDatabase, jobId: string) {
  const current = database
    .select({ job: assistantGenerationJobs, conversation: assistantConversations })
    .from(assistantGenerationJobs)
    .innerJoin(
      assistantConversations,
      eq(assistantGenerationJobs.conversationId, assistantConversations.id)
    )
    .where(eq(assistantGenerationJobs.id, jobId))
    .get();
  if (!current?.job.userMessageId || !current.job.assistantMessageId) return null;
  const user = database
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.id, current.job.userMessageId))
    .get();
  const assistant = database
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.id, current.job.assistantMessageId))
    .get();
  if (!user || !assistant) return null;
  const messages = database
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, current.conversation.id))
    .orderBy(asc(assistantMessages.sequence))
    .all();
  const citations = messages.length
    ? database
        .select()
        .from(assistantMessageCitations)
        .where(
          inArray(
            assistantMessageCitations.messageId,
            messages.map((message) => message.id)
          )
        )
        .orderBy(asc(assistantMessageCitations.createdAt))
        .all()
    : [];
  const byMessage = citationMap(citations);
  return {
    conversation: mapConversation(current.conversation),
    job: mapGenerationJob(current.job),
    userMessage: mapMessage(user, byMessage.get(user.id) ?? []),
    assistantMessage: mapMessage(assistant, byMessage.get(assistant.id) ?? []),
    messages: messages.map((message) => mapMessage(message, byMessage.get(message.id) ?? [])),
  } satisfies AssistantJobExecution;
}

function submissionFromExecution(execution: AssistantJobExecution): AssistantTurnSubmission {
  return {
    createdConversation: false,
    conversation: execution.conversation,
    userMessage: execution.userMessage,
    assistantMessage: execution.assistantMessage,
    generationJob: execution.job,
  };
}

type IdempotentSubmissionLookup =
  | { kind: "none" }
  | { kind: "not-owner" }
  | { kind: "gone" }
  | { kind: "submitted"; submission: AssistantTurnSubmission };

function findExistingSubmission(
  database: AssistantQueryDatabase,
  row: {
    job: typeof assistantGenerationJobs.$inferSelect;
    conversation: typeof assistantConversations.$inferSelect;
  },
  frontendUserId: string,
  now: number
): IdempotentSubmissionLookup {
  if (row.conversation.frontendUserId !== frontendUserId) return { kind: "not-owner" };
  if (row.conversation.status !== "active") return { kind: "gone" };
  if (row.conversation.expiresAt !== null && row.conversation.expiresAt <= now) {
    setConversationTerminal(database, row.conversation.id, "expired", now);
    return { kind: "gone" };
  }
  const execution = selectExecutionRows(database, row.job.id);
  return execution
    ? { kind: "submitted", submission: submissionFromExecution(execution) }
    : { kind: "gone" };
}

function findIdempotentSubmission(
  database: AssistantQueryDatabase,
  frontendUserId: string,
  requestId: string,
  clientRequestId: string | null | undefined,
  conversationId: string | null | undefined,
  now: number
): IdempotentSubmissionLookup {
  const existingRequest = database
    .select({ job: assistantGenerationJobs, conversation: assistantConversations })
    .from(assistantGenerationJobs)
    .innerJoin(
      assistantConversations,
      eq(assistantGenerationJobs.conversationId, assistantConversations.id)
    )
    .where(eq(assistantGenerationJobs.requestId, requestId))
    .get();
  if (existingRequest)
    return findExistingSubmission(database, existingRequest, frontendUserId, now);

  if (!clientRequestId) return { kind: "none" };
  const conditions = [
    eq(assistantMessages.clientRequestId, clientRequestId),
    eq(assistantConversations.frontendUserId, frontendUserId),
  ];
  if (conversationId) conditions.push(eq(assistantConversations.id, conversationId));
  const existingMessage = database
    .select({ job: assistantGenerationJobs, conversation: assistantConversations })
    .from(assistantMessages)
    .innerJoin(
      assistantConversations,
      eq(assistantMessages.conversationId, assistantConversations.id)
    )
    .innerJoin(
      assistantGenerationJobs,
      eq(assistantGenerationJobs.userMessageId, assistantMessages.id)
    )
    .where(and(...conditions))
    .get();
  return existingMessage
    ? findExistingSubmission(database, existingMessage, frontendUserId, now)
    : { kind: "none" };
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

    async getConversationState(conversationId: string, frontendUserId: string) {
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
      const now = Date.now();
      return database.transaction(
        (tx) => {
          const rows = tx
            .select()
            .from(assistantConversations)
            .where(eq(assistantConversations.frontendUserId, frontendUserId))
            .orderBy(desc(assistantConversations.createdAt))
            .all();
          for (const row of rows) {
            if (row.status === "active" && row.expiresAt !== null && row.expiresAt <= now) {
              setConversationTerminal(tx, row.id, "expired", now);
            }
          }
          return rows
            .filter(
              (row) => row.status === "active" && (row.expiresAt === null || row.expiresAt > now)
            )
            .map(mapConversation);
        },
        { behavior: "immediate" }
      );
    },

    async updateConversationClippingVersion(
      conversationId: string,
      frontendUserId: string,
      clippingVersionId: string,
      now = Date.now()
    ) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const conversation = selectConversation(tx, conversationId, frontendUserId);
          if (conversation?.kind !== "clipping" || conversation.status !== "active") return null;
          if (conversation.expiresAt !== null && conversation.expiresAt <= now) {
            setConversationTerminal(tx, conversationId, "expired", now);
            return null;
          }
          tx.update(assistantConversations)
            .set({ clippingVersionId })
            .where(eq(assistantConversations.id, conversationId))
            .run();
          const updated = tx
            .select()
            .from(assistantConversations)
            .where(eq(assistantConversations.id, conversationId))
            .get();
          return updated ? mapConversation(updated) : null;
        },
        { behavior: "immediate" }
      );
    },

    async appendMessage(input: AppendAssistantMessageInput) {
      const database = await getDatabase();
      const now = input.now ?? Date.now();
      return database.transaction(
        (tx) => {
          const conversation = selectConversation(tx, input.conversationId, input.frontendUserId);
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
            const policy = assistantPolicy(tx, now);
            tx.update(assistantConversations)
              .set({ lastUserMessageAt: now, expiresAt: now + policy.retentionMs })
              .where(eq(assistantConversations.id, input.conversationId))
              .run();
          }
          return mapMessage(row as typeof assistantMessages.$inferSelect);
        },
        { behavior: "immediate" }
      );
    },

    async listMessages(conversationId: string, frontendUserId: string) {
      return (await this.getConversationMessages(conversationId, frontendUserId)) ?? [];
    },

    async getConversationMessages(conversationId: string, frontendUserId: string) {
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
      if (!conversation) return null;
      const rows = await database
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.conversationId, conversationId))
        .orderBy(asc(assistantMessages.sequence))
        .all();
      const citations = rows.length
        ? await database
            .select()
            .from(assistantMessageCitations)
            .where(
              inArray(
                assistantMessageCitations.messageId,
                rows.map((row) => row.id)
              )
            )
            .orderBy(asc(assistantMessageCitations.createdAt))
            .all()
        : [];
      return mapMessages(rows, citations);
    },

    async listGenerationJobs(conversationId: string, frontendUserId: string) {
      const database = await getDatabase();
      const owner = await database
        .select({ id: assistantConversations.id })
        .from(assistantConversations)
        .where(
          and(
            eq(assistantConversations.id, conversationId),
            eq(assistantConversations.frontendUserId, frontendUserId)
          )
        )
        .get();
      if (!owner) return null;
      const rows = await database
        .select()
        .from(assistantGenerationJobs)
        .where(eq(assistantGenerationJobs.conversationId, conversationId))
        .orderBy(asc(assistantGenerationJobs.createdAt))
        .all();
      return rows.map(mapGenerationJob);
    },

    async createGenerationJob(input: CreateAssistantGenerationJobInput) {
      const database = await getDatabase();
      const now = input.now ?? Date.now();
      return database.transaction(
        (tx) => {
          const conversation = selectConversation(tx, input.conversationId, input.frontendUserId);
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

    async submitTurn(input: SubmitAssistantTurnInput): Promise<AssistantTurnSubmission> {
      const database = await getDatabase();
      const now = input.now ?? Date.now();
      const result = await database.transaction(
        (tx) => {
          const owner = tx
            .select({ isAdmin: frontendUsers.isAdmin })
            .from(frontendUsers)
            .where(eq(frontendUsers.id, input.frontendUserId))
            .get();
          const isAdmin = Boolean(input.isAdmin || owner?.isAdmin);
          const idempotent = findIdempotentSubmission(
            tx,
            input.frontendUserId,
            input.requestId,
            input.clientRequestId,
            input.conversationId,
            now
          );
          if (idempotent.kind === "not-owner")
            throw new AssistantStorageError("not-found", "Assistant turn is not available");
          if (idempotent.kind === "gone") return { kind: "gone" as const };
          if (idempotent.kind === "submitted")
            return { kind: "submitted" as const, submission: idempotent.submission };

          let conversation = input.conversationId
            ? selectConversation(tx, input.conversationId, input.frontendUserId)
            : undefined;
          if (input.conversationId && !conversation)
            throw new AssistantStorageError("not-found", "Assistant conversation is not available");

          let createdConversation = false;
          if (conversation) {
            if (conversation.status !== "active")
              throw new AssistantStorageError(
                "gone",
                "Assistant conversation is expired or deleted"
              );
            if (conversation.expiresAt !== null && conversation.expiresAt <= now) {
              setConversationTerminal(tx, conversation.id, "expired", now);
              return { kind: "expired" as const };
            }
          } else {
            const policy = assistantPolicy(tx, now);
            const stale = tx
              .select()
              .from(assistantConversations)
              .where(
                and(
                  eq(assistantConversations.frontendUserId, input.frontendUserId),
                  eq(assistantConversations.status, "active")
                )
              )
              .all();
            for (const row of stale) {
              if (row.expiresAt !== null && row.expiresAt <= now)
                setConversationTerminal(tx, row.id, "expired", now);
            }
            const activeCount = tx
              .select({ count: sql<number>`count(*)` })
              .from(assistantConversations)
              .where(
                and(
                  eq(assistantConversations.frontendUserId, input.frontendUserId),
                  eq(assistantConversations.status, "active"),
                  or(
                    isNull(assistantConversations.expiresAt),
                    gt(assistantConversations.expiresAt, now)
                  )
                )
              )
              .get();
            if (!isAdmin && Number(activeCount?.count ?? 0) >= policy.maxConversations)
              throw new AssistantStorageError("quota", "Assistant conversation limit reached");
            const row = {
              id: uuidv4(),
              frontendUserId: input.frontendUserId,
              kind: input.kind ?? "general",
              title: input.title ?? null,
              clippingMemoId: input.clippingMemoId ?? null,
              clippingVersionId: input.clippingVersionId ?? null,
              status: "active" as const,
              createdAt: now,
              lastUserMessageAt: now,
              expiresAt: isAdmin ? null : now + policy.retentionMs,
              deletedAt: null,
            } satisfies typeof assistantConversations.$inferInsert;
            tx.insert(assistantConversations).values(row).run();
            conversation = row as typeof assistantConversations.$inferSelect;
            createdConversation = true;
          }

          const activeJob = tx
            .select()
            .from(assistantGenerationJobs)
            .where(
              and(
                eq(assistantGenerationJobs.conversationId, conversation.id),
                inArray(assistantGenerationJobs.status, ["queued", "running"])
              )
            )
            .get();
          if (activeJob)
            throw new AssistantStorageError(
              "conflict",
              "Assistant conversation already has an active turn"
            );

          const history = tx
            .select({ content: assistantMessages.content })
            .from(assistantMessages)
            .where(eq(assistantMessages.conversationId, conversation.id))
            .all();
          const historyBytes = history.reduce(
            (total, message) => total + Buffer.byteLength(message.content, "utf8"),
            0
          );
          if (
            history.length + 2 > MAX_ASSISTANT_CONVERSATION_MESSAGES ||
            historyBytes + Buffer.byteLength(input.content, "utf8") >
              MAX_ASSISTANT_CONVERSATION_BYTES
          )
            throw new AssistantStorageError(
              "quota",
              "Assistant conversation history limit reached"
            );

          const latest = tx
            .select({ sequence: assistantMessages.sequence })
            .from(assistantMessages)
            .where(eq(assistantMessages.conversationId, conversation.id))
            .orderBy(desc(assistantMessages.sequence))
            .limit(1)
            .get();
          const userSequence = (latest?.sequence ?? 0) + 1;
          const userRow = {
            id: uuidv4(),
            conversationId: conversation.id,
            sequence: userSequence,
            role: "user" as const,
            content: input.content,
            status: "completed" as const,
            clientRequestId: input.clientRequestId ?? null,
            createdAt: now,
            updatedAt: now,
            completedAt: now,
          } satisfies typeof assistantMessages.$inferInsert;
          const assistantRow = {
            id: uuidv4(),
            conversationId: conversation.id,
            sequence: userSequence + 1,
            role: "assistant" as const,
            content: "",
            status: "pending" as const,
            clientRequestId: null,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          } satisfies typeof assistantMessages.$inferInsert;
          tx.insert(assistantMessages).values([userRow, assistantRow]).run();
          if (!createdConversation) {
            const policy = assistantPolicy(tx, now);
            tx.update(assistantConversations)
              .set({
                lastUserMessageAt: now,
                expiresAt: isAdmin ? null : now + policy.retentionMs,
              })
              .where(eq(assistantConversations.id, conversation.id))
              .run();
          }
          const jobRow = {
            id: uuidv4(),
            conversationId: conversation.id,
            userMessageId: userRow.id,
            assistantMessageId: assistantRow.id,
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
          tx.insert(assistantGenerationJobs).values(jobRow).run();
          return {
            kind: "submitted" as const,
            submission: {
              createdConversation,
              conversation: mapConversation(conversation),
              userMessage: mapMessage(userRow as typeof assistantMessages.$inferSelect),
              assistantMessage: mapMessage(assistantRow as typeof assistantMessages.$inferSelect),
              generationJob: mapGenerationJob(
                jobRow as typeof assistantGenerationJobs.$inferSelect
              ),
            },
          };
        },
        { behavior: "immediate" }
      );
      if (result.kind === "expired" || result.kind === "gone")
        throw new AssistantStorageError("gone", "Assistant conversation has expired");
      return result.submission;
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

    async findIdempotentTurn(
      frontendUserId,
      requestId,
      clientRequestId,
      conversationId,
      now = Date.now()
    ) {
      const database = await getDatabase();
      const result = await database.transaction(
        (tx) =>
          findIdempotentSubmission(
            tx,
            frontendUserId,
            requestId,
            clientRequestId,
            conversationId,
            now
          ),
        { behavior: "immediate" }
      );
      if (result.kind === "gone")
        throw new AssistantStorageError("gone", "Assistant conversation has expired");
      return result.kind === "submitted" ? result.submission : null;
    },

    async getJobExecution(generationJobId: string) {
      return selectExecutionRows(await getDatabase(), generationJobId);
    },

    async getFrontendUserIsAdmin(frontendUserId: string) {
      const database = await getDatabase();
      const row = await database
        .select({ isAdmin: frontendUsers.isAdmin })
        .from(frontendUsers)
        .where(eq(frontendUsers.id, frontendUserId))
        .get();
      return Boolean(row?.isAdmin);
    },

    async recoverRunningGenerations(now = Date.now()) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const rows = tx
            .select()
            .from(assistantGenerationJobs)
            .where(eq(assistantGenerationJobs.status, "running"))
            .all();
          for (const row of rows) {
            const cancelled = row.cancelRequested;
            tx.update(assistantGenerationJobs)
              .set({
                status: cancelled ? "cancelled" : "failed",
                leaseUntil: null,
                finishedAt: now,
                updatedAt: now,
                errorCode: cancelled ? "cancelled-by-user" : "worker-restarted",
              })
              .where(eq(assistantGenerationJobs.id, row.id))
              .run();
            if (row.assistantMessageId) {
              tx.update(assistantMessages)
                .set({
                  status: cancelled ? "cancelled" : "failed",
                  updatedAt: now,
                  completedAt: now,
                })
                .where(eq(assistantMessages.id, row.assistantMessageId))
                .run();
            }
          }
          return rows.length;
        },
        { behavior: "immediate" }
      );
    },

    async recoverExpiredGenerations(now = Date.now()) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const rows = tx
            .select()
            .from(assistantGenerationJobs)
            .where(eq(assistantGenerationJobs.status, "running"))
            .all()
            .filter((row) => row.leaseUntil !== null && row.leaseUntil <= now);
          for (const row of rows) {
            const cancelled = row.cancelRequested;
            tx.update(assistantGenerationJobs)
              .set({
                status: cancelled ? "cancelled" : "failed",
                leaseUntil: null,
                finishedAt: now,
                updatedAt: now,
                errorCode: cancelled ? "cancelled-by-user" : "worker-lease-expired",
              })
              .where(eq(assistantGenerationJobs.id, row.id))
              .run();
            if (row.assistantMessageId) {
              tx.update(assistantMessages)
                .set({
                  status: cancelled ? "cancelled" : "failed",
                  updatedAt: now,
                  completedAt: now,
                })
                .where(eq(assistantMessages.id, row.assistantMessageId))
                .run();
            }
          }
          return rows.length;
        },
        { behavior: "immediate" }
      );
    },

    async expireConversations(now = Date.now()) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const rows = tx
            .select({ id: assistantConversations.id })
            .from(assistantConversations)
            .where(
              and(
                eq(assistantConversations.status, "active"),
                isNotNull(assistantConversations.expiresAt),
                lte(assistantConversations.expiresAt, now)
              )
            )
            .all();
          for (const row of rows) setConversationTerminal(tx, row.id, "expired", now);
          return rows.length;
        },
        { behavior: "immediate" }
      );
    },

    async claimNextGenerationJob(now: number, leaseMs: number) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const queued = tx
            .select({ job: assistantGenerationJobs, conversation: assistantConversations })
            .from(assistantGenerationJobs)
            .innerJoin(
              assistantConversations,
              eq(assistantGenerationJobs.conversationId, assistantConversations.id)
            )
            .where(
              and(
                eq(assistantGenerationJobs.status, "queued"),
                eq(assistantGenerationJobs.cancelRequested, false)
              )
            )
            .orderBy(asc(assistantGenerationJobs.createdAt))
            .all();
          for (const item of queued) {
            if (
              item.conversation.status !== "active" ||
              (item.conversation.expiresAt !== null && item.conversation.expiresAt <= now)
            ) {
              setConversationTerminal(
                tx,
                item.conversation.id,
                item.conversation.status === "deleted" ? "deleted" : "expired",
                now
              );
              continue;
            }
            const active = tx
              .select({ id: assistantGenerationJobs.id })
              .from(assistantGenerationJobs)
              .where(
                and(
                  eq(assistantGenerationJobs.conversationId, item.conversation.id),
                  eq(assistantGenerationJobs.status, "running")
                )
              )
              .get();
            if (active) continue;
            tx.update(assistantGenerationJobs)
              .set({ status: "running", leaseUntil: now + leaseMs, startedAt: now, updatedAt: now })
              .where(
                and(
                  eq(assistantGenerationJobs.id, item.job.id),
                  eq(assistantGenerationJobs.status, "queued"),
                  eq(assistantGenerationJobs.cancelRequested, false)
                )
              )
              .run();
            const execution = selectExecutionRows(tx, item.job.id);
            if (execution) return execution;
            tx.update(assistantGenerationJobs)
              .set({
                status: "failed",
                leaseUntil: null,
                finishedAt: now,
                updatedAt: now,
                errorCode: "invalid-job",
              })
              .where(eq(assistantGenerationJobs.id, item.job.id))
              .run();
          }
          return null;
        },
        { behavior: "immediate" }
      );
    },

    async renewGenerationLease(
      generationJobId: string,
      attempt: number,
      now: number,
      leaseMs: number
    ) {
      const database = await getDatabase();
      database
        .update(assistantGenerationJobs)
        .set({ leaseUntil: now + leaseMs, updatedAt: now })
        .where(
          and(
            eq(assistantGenerationJobs.id, generationJobId),
            eq(assistantGenerationJobs.attempt, attempt),
            eq(assistantGenerationJobs.status, "running"),
            eq(assistantGenerationJobs.cancelRequested, false),
            gt(assistantGenerationJobs.leaseUntil, now)
          )
        )
        .run();
      const updated = await database
        .select({
          status: assistantGenerationJobs.status,
          attempt: assistantGenerationJobs.attempt,
          leaseUntil: assistantGenerationJobs.leaseUntil,
        })
        .from(assistantGenerationJobs)
        .where(eq(assistantGenerationJobs.id, generationJobId))
        .get();
      return (
        updated?.status === "running" &&
        updated.attempt === attempt &&
        updated.leaseUntil !== null &&
        updated.leaseUntil > now
      );
    },

    async appendGenerationDelta(
      generationJobId: string,
      attempt: number,
      content: string,
      now: number
    ) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const current = tx
            .select({ job: assistantGenerationJobs, conversation: assistantConversations })
            .from(assistantGenerationJobs)
            .innerJoin(
              assistantConversations,
              eq(assistantGenerationJobs.conversationId, assistantConversations.id)
            )
            .where(eq(assistantGenerationJobs.id, generationJobId))
            .get();
          if (
            !current ||
            current.job.attempt !== attempt ||
            current.job.status !== "running" ||
            current.job.cancelRequested ||
            current.job.leaseUntil === null ||
            current.job.leaseUntil <= now ||
            current.conversation.status !== "active" ||
            (current.conversation.expiresAt !== null && current.conversation.expiresAt <= now) ||
            !current.job.assistantMessageId
          )
            return false;
          tx.update(assistantMessages)
            .set({ content, status: "streaming", updatedAt: now })
            .where(eq(assistantMessages.id, current.job.assistantMessageId))
            .run();
          return true;
        },
        { behavior: "immediate" }
      );
    },

    async finishGeneration(generationJobId, attempt, input) {
      const database = await getDatabase();
      const now = input.now ?? Date.now();
      return database.transaction(
        (tx) => {
          const current = tx
            .select({ job: assistantGenerationJobs, conversation: assistantConversations })
            .from(assistantGenerationJobs)
            .innerJoin(
              assistantConversations,
              eq(assistantGenerationJobs.conversationId, assistantConversations.id)
            )
            .where(eq(assistantGenerationJobs.id, generationJobId))
            .get();
          if (!current || current.job.attempt !== attempt) return null;
          const invalid =
            current.job.status !== "running" ||
            current.job.cancelRequested ||
            current.job.leaseUntil === null ||
            current.job.leaseUntil <= now ||
            current.conversation.status !== "active" ||
            (current.conversation.expiresAt !== null && current.conversation.expiresAt <= now);
          if (invalid) {
            if (current.job.status === "running") {
              if (
                current.conversation.status === "active" &&
                current.conversation.expiresAt !== null &&
                current.conversation.expiresAt <= now
              ) {
                setConversationTerminal(tx, current.conversation.id, "expired", now);
              } else {
                const cancelled = current.job.cancelRequested;
                tx.update(assistantGenerationJobs)
                  .set({
                    status: cancelled ? "cancelled" : "failed",
                    cancelRequested: cancelled,
                    leaseUntil: null,
                    finishedAt: now,
                    updatedAt: now,
                    errorCode: cancelled ? "cancelled-by-user" : "worker-lease-expired",
                  })
                  .where(eq(assistantGenerationJobs.id, generationJobId))
                  .run();
                if (current.job.assistantMessageId) {
                  tx.update(assistantMessages)
                    .set({
                      status: cancelled ? "cancelled" : "failed",
                      updatedAt: now,
                      completedAt: now,
                    })
                    .where(eq(assistantMessages.id, current.job.assistantMessageId))
                    .run();
                }
              }
            }
          } else {
            if (current.job.assistantMessageId) {
              const patch: Partial<typeof assistantMessages.$inferInsert> = {
                status: input.status,
                updatedAt: now,
                completedAt: now,
              };
              if (input.content !== undefined) patch.content = input.content;
              tx.update(assistantMessages)
                .set(patch)
                .where(eq(assistantMessages.id, current.job.assistantMessageId))
                .run();
              if (input.status === "completed" && input.citations?.length) {
                tx.delete(assistantMessageCitations)
                  .where(eq(assistantMessageCitations.messageId, current.job.assistantMessageId))
                  .run();
                tx.insert(assistantMessageCitations)
                  .values(
                    input.citations.map((citation) => ({
                      id: uuidv4(),
                      messageId: current.job.assistantMessageId as string,
                      ...citation,
                      createdAt: now,
                    }))
                  )
                  .run();
              }
            }
            tx.update(assistantGenerationJobs)
              .set({
                status: input.status,
                leaseUntil: null,
                finishedAt: now,
                updatedAt: now,
                errorCode: input.errorCode ?? null,
              })
              .where(eq(assistantGenerationJobs.id, generationJobId))
              .run();
          }
          const updated = tx
            .select()
            .from(assistantGenerationJobs)
            .where(eq(assistantGenerationJobs.id, generationJobId))
            .get();
          return updated ? mapGenerationJob(updated) : null;
        },
        { behavior: "immediate" }
      );
    },

    async stopGeneration(generationJobId, frontendUserId, now = Date.now()) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const current = tx
            .select({ job: assistantGenerationJobs, conversation: assistantConversations })
            .from(assistantGenerationJobs)
            .innerJoin(
              assistantConversations,
              eq(assistantGenerationJobs.conversationId, assistantConversations.id)
            )
            .where(
              and(
                eq(assistantGenerationJobs.id, generationJobId),
                eq(assistantConversations.frontendUserId, frontendUserId)
              )
            )
            .get();
          if (!current) return null;
          if (current.job.status === "queued") {
            tx.update(assistantGenerationJobs)
              .set({
                status: "cancelled",
                cancelRequested: true,
                leaseUntil: null,
                finishedAt: now,
                updatedAt: now,
                errorCode: "cancelled-by-user",
              })
              .where(eq(assistantGenerationJobs.id, generationJobId))
              .run();
          } else if (current.job.status === "running") {
            tx.update(assistantGenerationJobs)
              .set({ cancelRequested: true, updatedAt: now, errorCode: "cancelled-by-user" })
              .where(eq(assistantGenerationJobs.id, generationJobId))
              .run();
          }
          if (
            current.job.assistantMessageId &&
            (current.job.status === "queued" || current.job.status === "running")
          ) {
            tx.update(assistantMessages)
              .set({ status: "cancelled", updatedAt: now, completedAt: now })
              .where(eq(assistantMessages.id, current.job.assistantMessageId))
              .run();
          }
          const updated = tx
            .select()
            .from(assistantGenerationJobs)
            .where(eq(assistantGenerationJobs.id, generationJobId))
            .get();
          return updated ? mapGenerationJob(updated) : null;
        },
        { behavior: "immediate" }
      );
    },

    async deleteConversation(conversationId, frontendUserId, now = Date.now()) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const conversation = selectConversation(tx, conversationId, frontendUserId);
          if (!conversation) return false;
          if (conversation.status !== "deleted")
            setConversationTerminal(tx, conversationId, "deleted", now);
          return true;
        },
        { behavior: "immediate" }
      );
    },

    async expireConversation(conversationId, frontendUserId, now = Date.now()) {
      const database = await getDatabase();
      return database.transaction(
        (tx) => {
          const conversation = selectConversation(tx, conversationId, frontendUserId);
          if (!conversation) return false;
          if (
            conversation.status === "active" &&
            conversation.expiresAt !== null &&
            conversation.expiresAt <= now
          )
            setConversationTerminal(tx, conversationId, "expired", now);
          return true;
        },
        { behavior: "immediate" }
      );
    },
  };
}
