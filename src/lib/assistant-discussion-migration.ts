import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyImmutable } from "@earendil-works/chord/delta";
import { clippingCreator, readAuthoredMemo } from "@/server/clipping/store";

export const ASSISTANT_DISCUSSION_MIGRATION_ID = "site-assistant-discussions-v1";

export type MigrationMode = "dry-run" | "apply";
type LedgerState = "migrated" | "quarantined" | "skipped" | "failed";
type SourceKind = "conversation" | "entry" | "partial" | "manifest";
type JsonObject = Record<string, unknown>;

export type DiscussionReference = {
  sourceConversationId: number;
  memoId: string;
  creatorId: string | null;
  targetUrl: string | null;
  clippingVersionId: string | null;
  referenceKind: "current" | "legacy-target";
  processing: boolean;
};

export type TrustedCreatorResolver = (
  reference: DiscussionReference
) => string | null | undefined | Promise<string | null | undefined>;

export type AssistantDiscussionMigrationOptions = {
  targetDbPath: string;
  piDbPath: string;
  mode?: MigrationMode;
  backupDir?: string;
  cleanup?: boolean;
  now?: () => number;
  migrationId?: string;
  resolveTrustedCreator?: TrustedCreatorResolver;
  failAfter?: number;
};

export type MigrationRecordReport = {
  sourceKind: SourceKind;
  sourceId: string;
  state: LedgerState;
  targetId: string | null;
  reason: string | null;
};

export type MigrationCleanupReport = {
  requested: boolean;
  verified: boolean;
  removed: string[];
  skipped: Array<{ sourceId: string; reason: string }>;
};

export type AssistantDiscussionMigrationReport = {
  migrationId: string;
  mode: MigrationMode;
  sourceVersion: string;
  status: "dry-run" | "complete" | "blocked";
  scanned: number;
  planned: number;
  migrated: number;
  quarantined: number;
  errorCount: number;
  backupManifestPath: string | null;
  cleanup: MigrationCleanupReport;
  records: MigrationRecordReport[];
};

type ParsedRecord = {
  value: unknown;
  raw: string;
  valid: boolean;
};

type SourceEntry = {
  id: number;
  conversationId: number;
  parsed: ParsedRecord;
  head: number | null;
  commitSeq: number | null;
};

type SourceTask = {
  id: number;
  conversationId: number;
  kind: string | null;
  status: string | null;
  record: ParsedRecord;
};

type SourceConversation = {
  id: number;
  record: ParsedRecord;
  entries: SourceEntry[];
  tasks: SourceTask[];
  live: unknown | null;
  sourceHash: string;
  rawPayload: JsonObject;
  protectionReasons: string[];
};

type SourceData = {
  namespace: string;
  version: string;
  conversations: SourceConversation[];
  activeOwner: boolean;
  ownerReason: string | null;
};

type ManifestSeed = {
  sourceKind: "manifest";
  sourceId: string;
  sourceHash: string;
  payload: JsonObject;
  reason: string;
};

type ReferenceData = {
  byConversation: Map<number, DiscussionReference[]>;
  invalidManifests: ManifestSeed[];
};

type LedgerRow = {
  migration_id: string;
  source_kind: SourceKind;
  source_id: string;
  source_hash: string;
  state: LedgerState;
  target_id: string | null;
  reason: string | null;
  payload: string;
};

type TargetIdentity = {
  id: string;
  isAdmin: boolean;
};

type TargetMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  sourceKind: "entry" | "partial";
  sourceId: string;
  sourceHash: string;
  payload: JsonObject;
};

type ConversationPlan = {
  source: SourceConversation;
  namespace: string;
  references: DiscussionReference[];
  reference: DiscussionReference;
  targetId: string;
  identity: TargetIdentity | null;
  reason: string | null;
  messages: TargetMessage[];
};

type BackupFile = {
  sourcePath: string;
  backupPath: string | null;
  bytes: number;
  sha256: string;
  copied: boolean;
};

type BackupManifest = {
  schemaVersion: 1;
  migrationId: string;
  mode: MigrationMode;
  sourceVersion: string;
  sourcePath: string;
  targetPath: string;
  createdAt: number;
  files: BackupFile[];
  records: MigrationRecordReport[];
};

const ACTIVE_TASK_STATUSES = new Set(["pending", "running", "waiting", "completing"]);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function parseRecord(raw: string): ParsedRecord {
  try {
    return { value: JSON.parse(raw) as unknown, raw, valid: true };
  } catch {
    return { value: { raw, invalid: true }, raw, valid: false };
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value === undefined ? null : value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function payloadJson(value: unknown): string {
  return canonicalJson(value);
}

function sourceNamespace(piDbPath: string): string {
  return sha256(path.resolve(piDbPath)).slice(0, 16);
}

function sourceId(namespace: string, kind: SourceKind, id: string | number): string {
  return `pi:${namespace}:${kind}:${String(id)}`;
}

function deterministicId(prefix: string, value: string): string {
  return `assistant-migration-${prefix}-${sha256(value).slice(0, 32)}`;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  const number = asNumber(value);
  if (number === null || number <= 0) return fallback;
  return number < 100_000_000_000 ? number * 1000 : number;
}

function tableExists(database: Database, table: string): boolean {
  return Boolean(
    database
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table)
  );
}

function tableColumns(database: Database, table: string): Set<string> {
  return new Set(
    database
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name)
  );
}

function readJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { raw: value, invalid: true };
  }
}

function rowRawPayload(row: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, readJsonValue(value)]));
}

function entryModel(record: unknown): unknown[] {
  if (!isObject(record)) return [];
  if (Array.isArray(record.model)) return record.model;
  if (isObject(record.data)) {
    if (Array.isArray(record.data.model)) return record.data.model;
    if (isObject(record.data.message)) return [record.data.message];
  }
  if (isObject(record.message)) return [record.message];
  if (isObject(record.data) && "role" in record.data && "content" in record.data)
    return [record.data];
  return [];
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined ? "" : canonicalJson(content);
  const text = content
    .flatMap((block) => {
      if (!isObject(block)) return [];
      if (typeof block.text === "string") return [block.text];
      if (typeof block.thinking === "string") return [block.thinking];
      return [];
    })
    .join("\n");
  return text || canonicalJson(content);
}

function messageTextForEntry(entryKind: string | null, message: JsonObject): string {
  const content = contentText(message.content);
  if (entryKind !== "pi.system" && entryKind !== "pi.compaction") return content;
  const sections = isObject(message.sections)
    ? Object.values(message.sections)
        .filter((value) => value !== null && value !== undefined)
        .map(contentText)
    : [];
  return [content, ...sections].filter((part) => part.length > 0).join("\n\n");
}

function messageRole(
  entryKind: string | null,
  message: JsonObject
): "user" | "assistant" | "system" | "tool" | null {
  if (entryKind === "pi.system" || entryKind === "pi.compaction") return "system";
  if (entryKind === "pi.tool-result") return "tool";
  if (message.role === "user" || message.role === "assistant") return message.role;
  if (message.role === "system") return "system";
  if (message.role === "tool" || message.role === "toolResult") return "tool";
  return null;
}

function messageStatus(
  role: "user" | "assistant" | "system" | "tool",
  message: JsonObject,
  partial: boolean
): TargetMessage["status"] {
  if (partial) return "streaming";
  if (role === "assistant" && ["error", "aborted"].includes(String(message.stopReason))) {
    return "failed";
  }
  return "completed";
}

function materializeLiveValue(database: Database, documentId: number, record: unknown): unknown {
  if (isObject(record) && "value" in record) return record.value;
  if (!tableExists(database, "document_revisions")) return null;
  const base = database
    .query<{ content: string; seq: number; version: number }, [number]>(
      "SELECT content, seq, version FROM document_revisions WHERE document_id = ? AND kind = 'base' ORDER BY seq DESC LIMIT 1"
    )
    .get(documentId);
  if (!base) return null;
  let value = readJsonValue(base.content);
  const revisions = database
    .query<{ content: string; kind: string; version: number }, [number, number]>(
      "SELECT content, kind, version FROM document_revisions WHERE document_id = ? AND seq > ? ORDER BY seq"
    )
    .all(documentId, base.seq);
  for (const revision of revisions) {
    if (revision.kind !== "delta" || revision.version !== base.version) return null;
    try {
      value = applyImmutable(value as never, readJsonValue(revision.content) as never) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

function readLiveDocument(database: Database, conversationId: number): unknown | null {
  if (!tableExists(database, "documents")) return null;
  const row = database
    .query<{ id: number; record: string }, [string, string, number]>(
      "SELECT id, record FROM documents WHERE kind = ? AND scope_kind = ? AND owner_id = ? AND retired_at IS NULL ORDER BY id DESC LIMIT 1"
    )
    .get("pi.live", "conversation", conversationId);
  if (!row) return null;
  const parsed = parseRecord(row.record);
  return { record: parsed.value, value: materializeLiveValue(database, row.id, parsed.value) };
}

function activeTaskReason(task: SourceTask): string | null {
  if (task.status && ACTIVE_TASK_STATUSES.has(task.status)) {
    return `active-task:${task.id}:${task.kind ?? "unknown"}`;
  }
  const record = isObject(task.record.value) ? task.record.value : null;
  const state = record && isObject(record.state) ? asString(record.state.status) : null;
  return state && ACTIVE_TASK_STATUSES.has(state)
    ? `active-task:${task.id}:${task.kind ?? "unknown"}`
    : null;
}

function readSourceVersion(database: Database): string {
  if (!tableExists(database, "durable_schema")) return "pi-durable-legacy";
  const row = database
    .query<{ version: number }, []>("SELECT version FROM durable_schema LIMIT 1")
    .get();
  return row && Number.isSafeInteger(row.version)
    ? `pi-durable-${row.version}`
    : "pi-durable-legacy";
}

function readSourceData(piDbPath: string, now: number): SourceData {
  const database = new Database(piDbPath, { readonly: true, strict: true });
  try {
    database.exec("PRAGMA query_only = ON");
    if (!tableExists(database, "conversations")) {
      throw new Error("Pi durable source is missing the conversations table");
    }
    const namespace = sourceNamespace(piDbPath);
    const version = readSourceVersion(database);
    const conversationColumns = tableColumns(database, "conversations");
    const entryColumns = tableExists(database, "entries")
      ? tableColumns(database, "entries")
      : new Set();
    const taskColumns = tableExists(database, "tasks")
      ? tableColumns(database, "tasks")
      : new Set();
    const conversations = database
      .query<Record<string, unknown>, []>(
        `SELECT ${conversationColumns.has("id") ? "id" : "rowid AS id"}, ${conversationColumns.has("record") ? "record" : "NULL AS record"} FROM conversations ORDER BY id`
      )
      .all();
    const entryRows = entryColumns.has("conversation_id")
      ? database
          .query<Record<string, unknown>, []>(
            `SELECT id, conversation_id, ${entryColumns.has("head") ? "head" : "NULL AS head"}, ${entryColumns.has("commit_seq") ? "commit_seq" : "NULL AS commit_seq"}, ${entryColumns.has("record") ? "record" : "NULL AS record"} FROM entries ORDER BY id`
          )
          .all()
      : [];
    const entriesByConversation = new Map<number, SourceEntry[]>();
    for (const row of entryRows) {
      const conversationId = asNumber(row.conversation_id);
      const id = asNumber(row.id);
      if (conversationId === null || id === null) continue;
      const entry: SourceEntry = {
        id,
        conversationId,
        parsed: parseRecord(String(row.record ?? "null")),
        head: asNumber(row.head),
        commitSeq: asNumber(row.commit_seq),
      };
      const existing = entriesByConversation.get(conversationId) ?? [];
      existing.push(entry);
      entriesByConversation.set(conversationId, existing);
    }
    const tasksByConversation = new Map<number, SourceTask[]>();
    if (taskColumns.has("conversation_id")) {
      const taskRows = database
        .query<Record<string, unknown>, []>(
          `SELECT id, conversation_id, ${taskColumns.has("kind") ? "kind" : "NULL AS kind"}, ${taskColumns.has("status") ? "status" : "NULL AS status"}, ${taskColumns.has("record") ? "record" : "NULL AS record"} FROM tasks ORDER BY id`
        )
        .all();
      for (const row of taskRows) {
        const conversationId = asNumber(row.conversation_id);
        const id = asNumber(row.id);
        if (conversationId === null || id === null) continue;
        const task: SourceTask = {
          id,
          conversationId,
          kind: asString(row.kind),
          status: asString(row.status),
          record: parseRecord(String(row.record ?? "null")),
        };
        const existing = tasksByConversation.get(conversationId) ?? [];
        existing.push(task);
        tasksByConversation.set(conversationId, existing);
      }
    }

    const owner = tableExists(database, "clipping_runtime_owner")
      ? database
          .query<{ expires: number }, []>(
            "SELECT expires FROM clipping_runtime_owner WHERE singleton = 1"
          )
          .get()
      : undefined;
    const activeOwner = Boolean(owner && owner.expires > now);
    const ownerReason = activeOwner ? "active-runtime-lease" : null;
    const sourceConversations: SourceConversation[] = conversations.flatMap((row) => {
      const id = asNumber(row.id);
      if (id === null) return [];
      const record = parseRecord(String(row.record ?? "null"));
      const entries = (entriesByConversation.get(id) ?? []).sort((a, b) => a.id - b.id);
      const tasks = (tasksByConversation.get(id) ?? []).sort((a, b) => a.id - b.id);
      const live = readLiveDocument(database, id);
      const protectionReasons = tasks.flatMap((task) => {
        const reason = activeTaskReason(task);
        return reason ? [reason] : [];
      });
      if (activeOwner) protectionReasons.push(ownerReason as string);
      const rawPayload: JsonObject = {
        sourceConversationId: id,
        conversation: record.value,
        conversationRaw: record.raw,
        entries: entries.map((entry) => ({
          id: entry.id,
          conversationId: entry.conversationId,
          head: entry.head,
          commitSeq: entry.commitSeq,
          record: entry.parsed.value,
          recordRaw: entry.parsed.raw,
        })),
        tasks: tasks.map((task) => ({
          id: task.id,
          conversationId: task.conversationId,
          kind: task.kind,
          status: task.status,
          record: task.record.value,
          recordRaw: task.record.raw,
        })),
        live,
      };
      return [
        {
          id,
          record,
          entries,
          tasks,
          live,
          sourceHash: sha256(payloadJson(rawPayload)),
          rawPayload,
          protectionReasons,
        },
      ];
    });
    return { namespace, version, conversations: sourceConversations, activeOwner, ownerReason };
  } finally {
    database.close();
  }
}

function versionProcessing(version: unknown): boolean {
  if (!isObject(version)) return false;
  return [version.status, version.summaryState, version.translationState].some((value) =>
    ["queued", "processing"].includes(String(value))
  );
}

function versionMatchesTarget(version: JsonObject | undefined, targetUrl: string | null): boolean {
  if (!version) return false;
  return asString(version.targetUrl) === targetUrl;
}

function versionForTarget(
  manifest: JsonObject,
  targetUrl: string | null,
  preferredId: string | null
): { id: string | null; processing: boolean } {
  const versions = Array.isArray(manifest.versions) ? manifest.versions.filter(isObject) : [];
  const active = versions.find((version) => version.id === manifest.activeVersionId);
  const current = preferredId
    ? versions.find(
        (version) => version.id === preferredId && versionMatchesTarget(version, targetUrl)
      )
    : undefined;
  const fallback = versions.findLast(
    (version) => versionMatchesTarget(version, targetUrl) && Boolean(asString(version.sourceHash))
  );
  const candidate = current ?? fallback;
  return {
    id: asString(candidate?.id),
    processing: versionProcessing(candidate) || versionProcessing(active),
  };
}

function numericConversationId(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function appendReference(
  references: Map<number, DiscussionReference[]>,
  reference: DiscussionReference
) {
  const existing = references.get(reference.sourceConversationId) ?? [];
  if (
    !existing.some(
      (candidate) =>
        candidate.memoId === reference.memoId &&
        candidate.referenceKind === reference.referenceKind &&
        candidate.targetUrl === reference.targetUrl &&
        candidate.clippingVersionId === reference.clippingVersionId
    )
  ) {
    existing.push(reference);
  }
  references.set(reference.sourceConversationId, existing);
}

function readReferenceData(target: Database): ReferenceData {
  if (!tableExists(target, "memo_clippings")) {
    throw new Error("Target database is missing memo_clippings; run bun run migrate first");
  }
  const references = new Map<number, DiscussionReference[]>();
  const invalidManifests: ManifestSeed[] = [];
  const rows = target
    .query<Record<string, unknown>, []>(
      "SELECT id, memo_id, creator_id, target_url, current_version_id, conversation_id, manifest FROM memo_clippings ORDER BY id"
    )
    .all();
  for (const row of rows) {
    const memoId = asString(row.memo_id) ?? String(row.id ?? "unknown");
    const rawManifest = String(row.manifest ?? "");
    let manifest: JsonObject;
    try {
      const parsed = JSON.parse(rawManifest) as unknown;
      if (!isObject(parsed)) throw new Error("manifest is not an object");
      manifest = parsed;
    } catch (error) {
      const sourceIdValue = `memo:${memoId}`;
      invalidManifests.push({
        sourceKind: "manifest",
        sourceId: sourceIdValue,
        sourceHash: sha256(rawManifest),
        payload: { row: rowRawPayload(row), error: String(error) },
        reason: "invalid-manifest",
      });
      continue;
    }
    const creatorId = asString(manifest.creatorId) ?? asString(row.creator_id);
    const targetUrl = asString(manifest.targetUrl) ?? asString(row.target_url);
    const currentConversationId = numericConversationId(
      manifest.conversationId ?? row.conversation_id
    );
    const currentVersion = versionForTarget(
      manifest,
      targetUrl,
      asString(manifest.currentVersionId) ?? asString(row.current_version_id)
    );
    const activeVersion = Array.isArray(manifest.versions)
      ? manifest.versions
          .filter(isObject)
          .find((version) => version.id === manifest.activeVersionId)
      : undefined;
    const manifestProcessing = versionProcessing(activeVersion);
    if (currentConversationId !== null) {
      appendReference(references, {
        sourceConversationId: currentConversationId,
        memoId,
        creatorId,
        targetUrl,
        clippingVersionId: currentVersion.id,
        referenceKind: "current",
        processing: manifestProcessing || currentVersion.processing,
      });
    }
    const previousConversations = Array.isArray(manifest.previousConversations)
      ? manifest.previousConversations.filter(isObject)
      : [];
    for (const previous of previousConversations) {
      const conversationId = numericConversationId(previous.conversationId);
      if (conversationId === null) continue;
      const previousTargetUrl = asString(previous.targetUrl);
      const previousVersion = versionForTarget(manifest, previousTargetUrl, null);
      appendReference(references, {
        sourceConversationId: conversationId,
        memoId,
        creatorId,
        targetUrl: previousTargetUrl,
        clippingVersionId: previousVersion.id,
        referenceKind: "legacy-target",
        processing: manifestProcessing || previousVersion.processing,
      });
    }
  }
  return { byConversation: references, invalidManifests };
}

async function defaultTrustedCreator(reference: DiscussionReference): Promise<string | null> {
  if (!reference.creatorId) return null;
  try {
    const authored = await readAuthoredMemo(reference.memoId);
    const creator = await clippingCreator(authored.frontmatter, reference.memoId);
    return creator === reference.creatorId ? creator : null;
  } catch {
    return null;
  }
}

function resolveIdentity(target: Database, creatorId: string): TargetIdentity | null {
  const rows = target
    .query<{ id: string; is_admin: number }, [string, string, string, string]>(
      `SELECT DISTINCT frontend_users.id, frontend_users.is_admin
       FROM frontend_users
       LEFT JOIN frontend_identity_links
         ON frontend_identity_links.frontend_user_id = frontend_users.id
       WHERE frontend_users.id = ?
          OR frontend_users.admin_user_id = ?
          OR frontend_identity_links.reader_id = ?
          OR frontend_identity_links.admin_user_id = ?`
    )
    .all(creatorId, creatorId, creatorId, creatorId);
  if (rows.length !== 1) return null;
  return { id: rows[0].id, isAdmin: Boolean(rows[0].is_admin) };
}

function chooseReference(references: DiscussionReference[]): DiscussionReference | null {
  if (!references.length) return null;
  const creatorIds = new Set(references.map((reference) => reference.creatorId));
  const memoIds = new Set(references.map((reference) => reference.memoId));
  if (creatorIds.size !== 1 || memoIds.size !== 1) return null;
  return references.find((reference) => reference.referenceKind === "current") ?? references[0];
}

function entryKind(record: unknown): string | null {
  return isObject(record) ? asString(record.kind) : null;
}

function makeTargetMessages(
  source: SourceConversation,
  namespace: string,
  now: number
): TargetMessage[] {
  const messages: TargetMessage[] = [];
  for (const entry of source.entries) {
    const kind = entryKind(entry.parsed.value);
    const models = entryModel(entry.parsed.value);
    models.forEach((value, index) => {
      if (!isObject(value)) return;
      const role = messageRole(kind, value);
      if (!role) return;
      const content = messageTextForEntry(kind, value);
      if (!content) return;
      const timestamp = normalizeTimestamp(value.timestamp, now);
      const sourceIdValue = sourceId(namespace, "entry", `${source.id}:${entry.id}:${index}`);
      const payload: JsonObject = {
        sourceConversationId: source.id,
        sourceEntryId: entry.id,
        modelIndex: index,
        entryKind: kind,
        message: value,
        entryRecord: entry.parsed.value,
        entryRecordRaw: entry.parsed.raw,
        content,
      };
      messages.push({
        id: deterministicId("message", sourceIdValue),
        role,
        content,
        status: messageStatus(role, value, false),
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: timestamp,
        sourceKind: "entry",
        sourceId: sourceIdValue,
        sourceHash: sourceEntryHash(entry),
        payload,
      });
    });
  }
  const live = isObject(source.live) && isObject(source.live.value) ? source.live.value : null;
  const generation = live && isObject(live.generation) ? live.generation : null;
  const partial = generation && isObject(generation.message) ? generation.message : null;
  if (partial) {
    const content = contentText(partial.content);
    if (content) {
      const sourceIdValue = sourceId(namespace, "partial", source.id);
      const timestamp = normalizeTimestamp(partial.timestamp, now);
      const payload: JsonObject = {
        sourceConversationId: source.id,
        partial,
        content,
      };
      messages.push({
        id: deterministicId("partial", sourceIdValue),
        role: "assistant",
        content,
        status: "streaming",
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        sourceKind: "partial",
        sourceId: sourceIdValue,
        sourceHash: sha256(payloadJson(payload)),
        payload,
      });
    }
  }
  return messages.sort(
    (left, right) => left.createdAt - right.createdAt || left.sourceId.localeCompare(right.sourceId)
  );
}

function getLedger(target: Database, migrationId: string, kind: SourceKind, sourceIdValue: string) {
  return target
    .query<LedgerRow, [string, string, string]>(
      "SELECT migration_id, source_kind, source_id, source_hash, state, target_id, reason, payload FROM assistant_migration_items WHERE migration_id = ? AND source_kind = ? AND source_id = ?"
    )
    .get(migrationId, kind, sourceIdValue);
}

function writeLedger(
  target: Database,
  migrationId: string,
  kind: SourceKind,
  sourceIdValue: string,
  sourceHash: string,
  state: LedgerState,
  targetId: string | null,
  reason: string | null,
  payload: unknown,
  now: number
) {
  const encoded = payloadJson(payload);
  target
    .query(
      `INSERT INTO assistant_migration_items
        (migration_id, source_kind, source_id, source_hash, state, target_id, reason, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(migration_id, source_kind, source_id) DO UPDATE SET
         source_hash = excluded.source_hash,
         state = excluded.state,
         target_id = excluded.target_id,
         reason = excluded.reason,
         payload = excluded.payload,
         updated_at = excluded.updated_at`
    )
    .run(migrationId, kind, sourceIdValue, sourceHash, state, targetId, reason, encoded, now, now);
}

function recordReport(
  records: MigrationRecordReport[],
  sourceKind: SourceKind,
  sourceIdValue: string,
  state: LedgerState,
  targetId: string | null,
  reason: string | null
) {
  records.push({ sourceKind, sourceId: sourceIdValue, state, targetId, reason });
}

function targetMessageRow(target: Database, id: string) {
  return target
    .query<
      {
        id: string;
        conversation_id: string;
        role: TargetMessage["role"];
        content: string;
        status: TargetMessage["status"];
        created_at: number;
        updated_at: number;
        completed_at: number | null;
      },
      [string]
    >(
      "SELECT id, conversation_id, role, content, status, created_at, updated_at, completed_at FROM assistant_messages WHERE id = ?"
    )
    .get(id);
}

function ensureTargetConversation(
  target: Database,
  plan: ConversationPlan,
  now: number,
  retentionMs: number
) {
  if (!plan.identity) throw new Error("Cannot create a conversation without a trusted identity");
  const existing = target
    .query<
      {
        frontend_user_id: string;
        kind: string;
        clipping_memo_id: string | null;
        clipping_version_id: string | null;
      },
      [string]
    >(
      "SELECT frontend_user_id, kind, clipping_memo_id, clipping_version_id FROM assistant_conversations WHERE id = ?"
    )
    .get(plan.targetId);
  if (existing) {
    if (
      existing.frontend_user_id !== plan.identity.id ||
      existing.kind !== "clipping" ||
      existing.clipping_memo_id !== plan.reference.memoId ||
      existing.clipping_version_id !== plan.reference.clippingVersionId
    ) {
      throw new Error("existing-target-conversation-conflict");
    }
    return;
  }
  const lastUserMessageAt =
    plan.messages
      .filter((message) => message.role === "user")
      .map((message) => message.createdAt)
      .sort((a, b) => b - a)[0] ?? null;
  const expiresAt = plan.identity.isAdmin
    ? null
    : lastUserMessageAt === null
      ? now + retentionMs
      : now + retentionMs;
  target
    .query(
      `INSERT INTO assistant_conversations
        (id, frontend_user_id, kind, title, clipping_memo_id, clipping_version_id, status, created_at, last_user_message_at, expires_at)
       VALUES (?, ?, 'clipping', ?, ?, ?, 'active', ?, ?, ?)`
    )
    .run(
      plan.targetId,
      plan.identity.id,
      plan.reference.targetUrl ?? plan.reference.memoId,
      plan.reference.memoId,
      plan.reference.clippingVersionId,
      plan.messages[0]?.createdAt ?? now,
      lastUserMessageAt,
      expiresAt
    );
}

function ensureEntryLedger(
  target: Database,
  migrationId: string,
  message: TargetMessage
): LedgerRow | undefined {
  const existing = getLedger(target, migrationId, message.sourceKind, message.sourceId);
  if (existing && existing.source_hash !== message.sourceHash) {
    if (message.sourceKind !== "partial") throw new Error("source-entry-hash-conflict");
    const existingMessage = existing.target_id
      ? targetMessageRow(target, existing.target_id)
      : undefined;
    if (existingMessage?.status !== "streaming") {
      throw new Error("source-partial-hash-conflict");
    }
  }
  return existing ?? undefined;
}

function writeTargetMessage(
  target: Database,
  migrationId: string,
  conversationId: string,
  message: TargetMessage,
  sequence: number,
  now: number
) {
  ensureEntryLedger(target, migrationId, message);
  const existingTarget = targetMessageRow(target, message.id);
  if (existingTarget) {
    const matches =
      existingTarget.conversation_id === conversationId &&
      existingTarget.role === message.role &&
      existingTarget.content === message.content &&
      existingTarget.status === message.status;
    if (!matches) {
      if (
        message.sourceKind === "partial" &&
        existingTarget.conversation_id === conversationId &&
        existingTarget.status === "streaming"
      ) {
        target
          .query(
            "UPDATE assistant_messages SET content = ?, status = ?, updated_at = ?, completed_at = ? WHERE id = ?"
          )
          .run(message.content, message.status, now, message.completedAt, message.id);
      } else {
        throw new Error("existing-target-message-conflict");
      }
    }
  } else {
    target
      .query(
        `INSERT INTO assistant_messages
          (id, conversation_id, sequence, role, content, status, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        conversationId,
        sequence,
        message.role,
        message.content,
        message.status,
        message.createdAt,
        message.updatedAt,
        message.completedAt
      );
  }
  writeLedger(
    target,
    migrationId,
    message.sourceKind,
    message.sourceId,
    message.sourceHash,
    "migrated",
    message.id,
    null,
    { ...message.payload, targetId: message.id },
    now
  );
}

function settleMissingPartial(
  target: Database,
  migrationId: string,
  plan: ConversationPlan,
  now: number
) {
  if (plan.messages.some((message) => message.sourceKind === "partial")) return;
  if (
    !plan.messages.some((message) => message.sourceKind === "entry" && message.role === "assistant")
  )
    return;
  const partialSourceId = sourceId(plan.namespace, "partial", plan.source.id);
  const ledger = getLedger(target, migrationId, "partial", partialSourceId);
  if (!ledger?.target_id) return;
  const partial = targetMessageRow(target, ledger.target_id);
  if (partial?.status !== "streaming") return;
  target
    .query(
      "UPDATE assistant_messages SET status = 'cancelled', updated_at = ?, completed_at = ? WHERE id = ?"
    )
    .run(now, now, ledger.target_id);
}

function migratePlan(
  target: Database,
  migrationId: string,
  plan: ConversationPlan,
  now: number,
  retentionMs: number
) {
  const conversationSourceId = sourceId(plan.namespace, "conversation", plan.source.id);
  target.exec("BEGIN IMMEDIATE");
  try {
    ensureTargetConversation(target, plan, now, retentionMs);
    settleMissingPartial(target, migrationId, plan, now);
    const existingConversationLedger = getLedger(
      target,
      migrationId,
      "conversation",
      conversationSourceId
    );
    const existingMessages = target
      .query<{ sequence: number }, [string]>(
        "SELECT sequence FROM assistant_messages WHERE conversation_id = ? ORDER BY sequence DESC LIMIT 1"
      )
      .get(plan.targetId);
    let sequence = (existingMessages?.sequence ?? 0) + 1;
    for (const message of plan.messages) {
      const existing = getLedger(target, migrationId, message.sourceKind, message.sourceId);
      if (
        existing?.state === "migrated" &&
        existing.source_hash === message.sourceHash &&
        existing.target_id &&
        targetMessageRow(target, existing.target_id)
      )
        continue;
      writeTargetMessage(target, migrationId, plan.targetId, message, sequence, now);
      sequence += 1;
    }
    writeLedger(
      target,
      migrationId,
      "conversation",
      conversationSourceId,
      plan.source.sourceHash,
      "migrated",
      plan.targetId,
      null,
      {
        sourceConversationId: plan.source.id,
        sourceHash: plan.source.sourceHash,
        reference: plan.reference,
        targetId: plan.targetId,
        messageIds: plan.messages.map((message) => message.id),
      },
      now
    );
    target.exec("COMMIT");
    return existingConversationLedger;
  } catch (error) {
    target.exec("ROLLBACK");
    throw error;
  }
}

function retentionMs(target: Database): number {
  if (!tableExists(target, "assistant_quota_policies")) return 7 * 24 * 60 * 60 * 1000;
  const row = target
    .query<{ retention_ms: number }, []>(
      "SELECT retention_ms FROM assistant_quota_policies WHERE scope = 'global' ORDER BY updated_at DESC LIMIT 1"
    )
    .get();
  return row && Number.isSafeInteger(row.retention_ms) ? row.retention_ms : 7 * 24 * 60 * 60 * 1000;
}

function makePlan(
  target: Database,
  source: SourceConversation,
  references: DiscussionReference[],
  namespace: string,
  now: number,
  resolver: TrustedCreatorResolver
): Promise<ConversationPlan> {
  const reference = chooseReference(references);
  const targetId = deterministicId("conversation", `pi:${namespace}:conversation:${source.id}`);
  if (!reference) {
    return Promise.resolve({
      source,
      namespace,
      references,
      reference: references[0] ?? {
        sourceConversationId: source.id,
        memoId: "",
        creatorId: null,
        targetUrl: null,
        clippingVersionId: null,
        referenceKind: "legacy-target",
        processing: false,
      },
      targetId,
      identity: null,
      reason: references.length ? "conflicting-attribution" : "unreferenced-conversation",
      messages: [],
    });
  }
  return Promise.resolve(resolver(reference)).then((trustedCreator) => {
    const identity = trustedCreator ? resolveIdentity(target, trustedCreator) : null;
    return {
      source,
      namespace,
      references,
      reference,
      targetId,
      identity,
      reason: !trustedCreator
        ? "unknown-author"
        : !identity
          ? "identity-link-not-found-or-ambiguous"
          : !source.record.valid
            ? "invalid-conversation-record"
            : null,
      messages: identity && source.record.valid ? makeTargetMessages(source, namespace, now) : [],
    };
  });
}

function backupFiles(
  sourcePath: string,
  backupRoot: string | null,
  mode: MigrationMode
): BackupFile[] {
  const candidates = [sourcePath, `${sourcePath}-wal`, `${sourcePath}-shm`].filter((candidate) =>
    fs.existsSync(candidate)
  );
  return candidates.map((candidate) => {
    const bytes = fs.statSync(candidate).size;
    const digest = sha256Bytes(fs.readFileSync(candidate));
    const backupPath = backupRoot ? path.join(backupRoot, path.basename(candidate)) : null;
    if (mode === "apply" && backupPath) {
      fs.copyFileSync(candidate, backupPath);
      fs.chmodSync(backupPath, 0o600);
    }
    return { sourcePath: candidate, backupPath, bytes, sha256: digest, copied: mode === "apply" };
  });
}

function writeBackupManifest(
  options: Required<Pick<AssistantDiscussionMigrationOptions, "targetDbPath" | "piDbPath">> & {
    migrationId: string;
    sourceVersion: string;
    mode: MigrationMode;
    now: number;
    records: MigrationRecordReport[];
    backupDir?: string;
  }
): { path: string; manifest: BackupManifest } | null {
  if (!options.backupDir) return null;
  const root = path.resolve(options.backupDir);
  const directory =
    options.mode === "apply" ? path.join(root, `${options.migrationId}-${options.now}`) : root;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const manifest: BackupManifest = {
    schemaVersion: 1,
    migrationId: options.migrationId,
    mode: options.mode,
    sourceVersion: options.sourceVersion,
    sourcePath: path.resolve(options.piDbPath),
    targetPath: path.resolve(options.targetDbPath),
    createdAt: options.now,
    files: backupFiles(
      path.resolve(options.piDbPath),
      options.mode === "apply" ? directory : null,
      options.mode
    ),
    records: options.records,
  };
  const manifestPath = path.join(directory, "backup-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(manifestPath, 0o600);
  return { path: manifestPath, manifest };
}

function updateBackupManifest(
  backup: { path: string; manifest: BackupManifest } | null,
  records: MigrationRecordReport[]
) {
  if (!backup) return;
  backup.manifest.records = records;
  fs.writeFileSync(backup.path, `${JSON.stringify(backup.manifest, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(backup.path, 0o600);
}

function assertMigrationTables(target: Database) {
  for (const table of [
    "assistant_migration_state",
    "assistant_migration_items",
    "assistant_migration_backups",
  ])
    if (!tableExists(target, table)) {
      throw new Error(`${table} is missing; run bun run migrate before the discussion backfill`);
    }
  for (const table of [
    "assistant_conversations",
    "assistant_messages",
    "frontend_users",
    "frontend_identity_links",
  ])
    if (!tableExists(target, table)) {
      throw new Error(`${table} is missing; run bun run migrate before the discussion backfill`);
    }
}

function updateMigrationState(
  target: Database,
  migrationId: string,
  sourceVersion: string,
  status: "pending" | "running" | "blocked" | "complete",
  now: number,
  cursor: string | null,
  lastError: string | null
) {
  const counts = target
    .query<
      { scanned: number; migrated: number; quarantined: number; error_count: number },
      [string]
    >(
      `SELECT
         COUNT(DISTINCT CASE WHEN source_kind = 'conversation' THEN source_id END) AS scanned,
         COUNT(DISTINCT CASE WHEN source_kind = 'conversation' AND state = 'migrated' THEN source_id END) AS migrated,
         COUNT(DISTINCT CASE WHEN state = 'quarantined' THEN source_id END) AS quarantined,
         COUNT(DISTINCT CASE WHEN state = 'failed' THEN source_id END) AS error_count
       FROM assistant_migration_items WHERE migration_id = ?`
    )
    .get(migrationId) ?? { scanned: 0, migrated: 0, quarantined: 0, error_count: 0 };
  target
    .query(
      `INSERT INTO assistant_migration_state
        (id, status, source_version, cursor, scanned, migrated, quarantined, error_count, updated_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         source_version = excluded.source_version,
         cursor = excluded.cursor,
         scanned = excluded.scanned,
         migrated = excluded.migrated,
         quarantined = excluded.quarantined,
         error_count = excluded.error_count,
         updated_at = excluded.updated_at,
         last_error = excluded.last_error`
    )
    .run(
      migrationId,
      status,
      sourceVersion,
      cursor,
      counts.scanned,
      counts.migrated,
      counts.quarantined,
      counts.error_count,
      now,
      lastError
    );
}

function sourceEntryHash(entry: SourceEntry): string {
  return sha256(payloadJson({ raw: entry.parsed.raw, value: entry.parsed.value }));
}

function writeSkippedEntries(
  target: Database,
  migrationId: string,
  source: SourceConversation,
  namespace: string,
  messages: readonly TargetMessage[],
  now: number,
  records: MigrationRecordReport[]
) {
  for (const entry of source.entries) {
    const hasTargetMessage = messages.some(
      (message) => message.sourceKind === "entry" && message.payload.sourceEntryId === entry.id
    );
    if (hasTargetMessage && entry.parsed.valid) continue;
    const sourceIdValue = sourceId(namespace, "entry", `${source.id}:${entry.id}:raw`);
    const reason = entry.parsed.valid ? "entry-has-no-migratable-message" : "invalid-entry-record";
    const state: LedgerState = entry.parsed.valid ? "skipped" : "quarantined";
    writeLedger(
      target,
      migrationId,
      "entry",
      sourceIdValue,
      sourceEntryHash(entry),
      state,
      null,
      reason,
      {
        sourceConversationId: source.id,
        sourceEntryId: entry.id,
        record: entry.parsed.value,
        recordRaw: entry.parsed.raw,
      },
      now
    );
    recordReport(records, "entry", sourceIdValue, state, null, reason);
  }
}

function quarantinePlan(
  target: Database,
  migrationId: string,
  plan: ConversationPlan,
  now: number,
  records: MigrationRecordReport[]
) {
  const sourceIdValue = sourceId(plan.namespace, "conversation", plan.source.id);
  const existing = getLedger(target, migrationId, "conversation", sourceIdValue);
  if (existing?.state === "quarantined" && existing.source_hash === plan.source.sourceHash) {
    recordReport(records, "conversation", sourceIdValue, "quarantined", null, existing.reason);
    return;
  }
  writeLedger(
    target,
    migrationId,
    "conversation",
    sourceIdValue,
    plan.source.sourceHash,
    "quarantined",
    null,
    plan.reason,
    {
      ...plan.source.rawPayload,
      references: plan.references,
      quarantineReason: plan.reason,
    },
    now
  );
  recordReport(records, "conversation", sourceIdValue, "quarantined", null, plan.reason);
}

function planRecords(
  plan: ConversationPlan,
  records: MigrationRecordReport[],
  source: SourceData,
  mode: MigrationMode
) {
  const sourceIdValue = sourceId(source.namespace, "conversation", plan.source.id);
  const state: LedgerState = plan.reason ? "quarantined" : "migrated";
  recordReport(
    records,
    "conversation",
    sourceIdValue,
    state,
    plan.reason ? null : plan.targetId,
    plan.reason
  );
  if (mode === "dry-run" && !plan.reason) {
    for (const message of plan.messages)
      recordReport(records, message.sourceKind, message.sourceId, "migrated", message.id, null);
  }
}

function verifyPlans(
  target: Database,
  migrationId: string,
  plans: ConversationPlan[]
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const plan of plans) {
    if (plan.reason || !plan.identity) continue;
    const sourceIdValue = sourceId(plan.namespace, "conversation", plan.source.id);
    const conversationLedger = getLedger(target, migrationId, "conversation", sourceIdValue);
    const conversation = target
      .query<{ frontend_user_id: string; clipping_memo_id: string | null }, [string]>(
        "SELECT frontend_user_id, clipping_memo_id FROM assistant_conversations WHERE id = ?"
      )
      .get(plan.targetId);
    if (
      conversationLedger?.state !== "migrated" ||
      conversationLedger?.target_id !== plan.targetId ||
      conversationLedger?.source_hash !== plan.source.sourceHash ||
      !conversation ||
      conversation.frontend_user_id !== plan.identity.id ||
      conversation.clipping_memo_id !== plan.reference.memoId
    ) {
      reasons.push(`${sourceIdValue}:conversation-mismatch`);
      continue;
    }
    for (const message of plan.messages) {
      const ledger = getLedger(target, migrationId, message.sourceKind, message.sourceId);
      const row = targetMessageRow(target, message.id);
      if (
        ledger?.state !== "migrated" ||
        ledger?.source_hash !== message.sourceHash ||
        ledger?.target_id !== message.id ||
        !row ||
        row.conversation_id !== plan.targetId ||
        row.role !== message.role ||
        row.content !== message.content ||
        row.status !== message.status
      ) {
        reasons.push(`${message.sourceId}:message-mismatch`);
      }
    }
    const archivedEntryIds = new Set(
      plan.messages
        .filter((message) => message.sourceKind === "entry")
        .map((message) => message.payload.sourceEntryId)
    );
    for (const entry of plan.source.entries) {
      if (archivedEntryIds.has(entry.id)) continue;
      const rawSourceId = sourceId(plan.namespace, "entry", `${plan.source.id}:${entry.id}:raw`);
      const rawLedger = getLedger(target, migrationId, "entry", rawSourceId);
      if (
        !rawLedger ||
        !["skipped", "quarantined"].includes(rawLedger.state) ||
        rawLedger.source_hash !== sourceEntryHash(entry)
      ) {
        reasons.push(`${rawSourceId}:entry-ledger-mismatch`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function activeTasksForConversation(database: Database, conversationId: number): string[] {
  if (!tableExists(database, "tasks")) return [];
  return database
    .query<{ id: number; kind: string; status: string }, [number]>(
      "SELECT id, kind, status FROM tasks WHERE conversation_id = ? AND status <> 'terminal' ORDER BY id"
    )
    .all(conversationId)
    .map((task) => `active-task:${task.id}:${task.kind}`);
}

function deleteSourceConversation(database: Database, conversationId: number) {
  const recordIds = new Set<number>();
  if (tableExists(database, "conversations")) recordIds.add(conversationId);
  for (const table of ["entries", "tasks", "submissions", "documents"]) {
    if (!tableExists(database, table)) continue;
    const column = table === "documents" ? "owner_id" : "conversation_id";
    const rows = database
      .query<{ id: number }, [number]>(`SELECT id FROM ${table} WHERE ${column} = ?`)
      .all(conversationId);
    for (const row of rows) recordIds.add(row.id);
    if (table === "documents" && tableExists(database, "document_revisions")) {
      for (const row of rows)
        database.query("DELETE FROM document_revisions WHERE document_id = ?").run(row.id);
    }
    database.query(`DELETE FROM ${table} WHERE ${column} = ?`).run(conversationId);
  }
  if (tableExists(database, "conversations")) {
    database.query("DELETE FROM conversations WHERE id = ?").run(conversationId);
  }
  if (tableExists(database, "record_ids")) {
    const deleteRecord = database.query("DELETE FROM record_ids WHERE id = ?");
    for (const id of recordIds) deleteRecord.run(id);
  }
}

function cleanupVerifiedSource(
  piDbPath: string,
  source: SourceData,
  plans: ConversationPlan[],
  target: Database,
  migrationId: string,
  now: number,
  verified: boolean
): MigrationCleanupReport {
  const result: MigrationCleanupReport = {
    requested: true,
    verified,
    removed: [],
    skipped: [],
  };
  if (!verified) {
    for (const plan of plans.filter((candidate) => !candidate.reason)) {
      result.skipped.push({
        sourceId: sourceId(source.namespace, "conversation", plan.source.id),
        reason: "verification-failed",
      });
    }
    return result;
  }
  if (source.activeOwner) {
    for (const plan of plans.filter((candidate) => !candidate.reason)) {
      result.skipped.push({
        sourceId: sourceId(source.namespace, "conversation", plan.source.id),
        reason: source.ownerReason ?? "active-runtime-lease",
      });
    }
    return result;
  }
  const database = new Database(piDbPath, { strict: true });
  try {
    for (const plan of plans) {
      if (plan.reason || !plan.identity) continue;
      const sourceIdValue = sourceId(source.namespace, "conversation", plan.source.id);
      if (plan.references.some((reference) => reference.processing)) {
        result.skipped.push({ sourceId: sourceIdValue, reason: "clipping-processing" });
        continue;
      }
      let transactionOpen = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        const fresh = readSourceData(piDbPath, now);
        if (fresh.activeOwner) {
          database.exec("ROLLBACK");
          transactionOpen = false;
          result.skipped.push({ sourceId: sourceIdValue, reason: "active-runtime-lease" });
          continue;
        }
        const current = fresh.conversations.find((candidate) => candidate.id === plan.source.id);
        if (!current) {
          database.exec("ROLLBACK");
          transactionOpen = false;
          result.skipped.push({ sourceId: sourceIdValue, reason: "source-already-absent" });
          continue;
        }
        const ledger = getLedger(target, migrationId, "conversation", sourceIdValue);
        if (!ledger || ledger.source_hash !== current.sourceHash) {
          database.exec("ROLLBACK");
          transactionOpen = false;
          result.skipped.push({ sourceId: sourceIdValue, reason: "source-changed-before-cleanup" });
          continue;
        }
        if (current.entries.some((entry) => !entry.parsed.valid)) {
          database.exec("ROLLBACK");
          transactionOpen = false;
          result.skipped.push({ sourceId: sourceIdValue, reason: "invalid-source-entry" });
          continue;
        }
        const activeTasks = activeTasksForConversation(database, plan.source.id);
        if (activeTasks.length) {
          database.exec("ROLLBACK");
          transactionOpen = false;
          result.skipped.push({ sourceId: sourceIdValue, reason: activeTasks.join(",") });
          continue;
        }
        const owner = tableExists(database, "clipping_runtime_owner")
          ? database
              .query<{ expires: number }, []>(
                "SELECT expires FROM clipping_runtime_owner WHERE singleton = 1"
              )
              .get()
          : undefined;
        if (owner && owner.expires > now) throw new Error("active-runtime-lease");
        const stillActive = activeTasksForConversation(database, plan.source.id);
        if (stillActive.length) throw new Error(stillActive.join(","));
        deleteSourceConversation(database, plan.source.id);
        database.exec("COMMIT");
        transactionOpen = false;
        result.removed.push(sourceIdValue);
      } catch (error) {
        if (transactionOpen) {
          try {
            database.exec("ROLLBACK");
          } catch {
            // Preserve the cleanup reason if the source transaction is already closed.
          }
        }
        result.skipped.push({ sourceId: sourceIdValue, reason: String(error) });
      }
    }
  } finally {
    database.close();
  }
  return result;
}

export async function migrateAssistantDiscussions(
  options: AssistantDiscussionMigrationOptions
): Promise<AssistantDiscussionMigrationReport> {
  const mode = options.mode ?? "dry-run";
  if (options.cleanup && mode !== "apply") {
    throw new Error("Source cleanup requires --apply");
  }
  const migrationId = options.migrationId ?? ASSISTANT_DISCUSSION_MIGRATION_ID;
  const now = options.now?.() ?? Date.now();
  const targetDbPath = path.resolve(options.targetDbPath);
  const piDbPath = path.resolve(options.piDbPath);
  const resolver = options.resolveTrustedCreator ?? defaultTrustedCreator;
  const target = new Database(targetDbPath, { strict: true });
  let backup: { path: string; manifest: BackupManifest } | null = null;
  let stateStarted = false;
  const records: MigrationRecordReport[] = [];
  let source: SourceData | undefined;
  let plans: ConversationPlan[] = [];
  let processed = 0;

  try {
    assertMigrationTables(target);
    source = readSourceData(piDbPath, now);
    const references = readReferenceData(target);
    plans = await Promise.all(
      source.conversations.map((conversation) =>
        makePlan(
          target,
          conversation,
          references.byConversation.get(conversation.id) ?? [],
          source?.namespace ?? sourceNamespace(piDbPath),
          now,
          resolver
        )
      )
    );

    for (const invalid of references.invalidManifests) {
      records.push({
        sourceKind: invalid.sourceKind,
        sourceId: invalid.sourceId,
        state: "quarantined",
        targetId: null,
        reason: invalid.reason,
      });
    }
    const modeBackup = writeBackupManifest({
      targetDbPath,
      piDbPath,
      migrationId,
      sourceVersion: source.version,
      mode,
      now,
      records: [],
      backupDir: options.backupDir,
    });
    backup = modeBackup;

    if (mode === "dry-run") {
      for (const plan of plans) planRecords(plan, records, source, mode);
      updateBackupManifest(backup, records);
      return {
        migrationId,
        mode,
        sourceVersion: source.version,
        status: "dry-run",
        scanned: source.conversations.length + references.invalidManifests.length,
        planned: plans.filter((plan) => !plan.reason && plan.identity).length,
        migrated: plans.filter((plan) => !plan.reason && plan.identity).length,
        quarantined: records.filter((record) => record.state === "quarantined").length,
        errorCount: 0,
        backupManifestPath: backup?.path ?? null,
        cleanup: { requested: false, verified: false, removed: [], skipped: [] },
        records,
      };
    }

    updateMigrationState(target, migrationId, source.version, "running", now, null, null);
    stateStarted = true;
    for (const plan of plans) {
      if (options.failAfter !== undefined && processed >= options.failAfter) {
        throw new Error("injected-migration-interruption");
      }
      processed += 1;
      if (plan.reason || !plan.identity) {
        quarantinePlan(target, migrationId, plan, now, records);
        continue;
      }
      try {
        migratePlan(target, migrationId, plan, now, retentionMs(target));
        writeSkippedEntries(
          target,
          migrationId,
          plan.source,
          plan.namespace,
          plan.messages,
          now,
          records
        );
        recordReport(
          records,
          "conversation",
          sourceId(source.namespace, "conversation", plan.source.id),
          "migrated",
          plan.targetId,
          null
        );
        for (const message of plan.messages)
          recordReport(records, message.sourceKind, message.sourceId, "migrated", message.id, null);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const sourceIdValue = sourceId(source.namespace, "conversation", plan.source.id);
        writeLedger(
          target,
          migrationId,
          "conversation",
          sourceIdValue,
          plan.source.sourceHash,
          "failed",
          plan.targetId,
          reason,
          { ...plan.source.rawPayload, failure: reason },
          now
        );
        recordReport(records, "conversation", sourceIdValue, "failed", plan.targetId, reason);
      }
      updateMigrationState(
        target,
        migrationId,
        source.version,
        "running",
        now,
        sourceId(source.namespace, "conversation", plan.source.id),
        null
      );
    }
    for (const invalid of references.invalidManifests) {
      writeLedger(
        target,
        migrationId,
        "manifest",
        invalid.sourceId,
        invalid.sourceHash,
        "quarantined",
        null,
        invalid.reason,
        invalid.payload,
        now
      );
    }

    const verification = verifyPlans(target, migrationId, plans);
    const cleanup = options.cleanup
      ? cleanupVerifiedSource(piDbPath, source, plans, target, migrationId, now, verification.ok)
      : { requested: false, verified: verification.ok, removed: [], skipped: [] };
    const errorCount = records.filter((record) => record.state === "failed").length;
    const quarantined = records.filter((record) => record.state === "quarantined").length;
    const blocked = errorCount > 0 || quarantined > 0 || !verification.ok;
    const finalStatus: "blocked" | "complete" = blocked ? "blocked" : "complete";
    const lastError = blocked
      ? [
          ...verification.reasons,
          ...records.flatMap((record) => (record.reason ? [record.reason] : [])),
        ]
          .slice(0, 20)
          .join("; ") || "migration-blocked"
      : null;
    updateMigrationState(
      target,
      migrationId,
      source.version,
      finalStatus,
      now,
      records.at(-1)?.sourceId ?? null,
      lastError
    );
    updateBackupManifest(backup, records);
    if (backup) {
      const manifestHash = sha256Bytes(fs.readFileSync(backup.path));
      target
        .query(
          `INSERT INTO assistant_migration_backups
            (id, migration_id, source_path, source_version, manifest_path, manifest_hash, created_at, verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)` +
            ` ON CONFLICT(id) DO UPDATE SET
            manifest_hash = excluded.manifest_hash,
            verified_at = excluded.verified_at`
        )
        .run(
          deterministicId("backup", `${migrationId}:${backup.path}`),
          migrationId,
          piDbPath,
          source.version,
          backup.path,
          manifestHash,
          now,
          verification.ok ? now : null
        );
    }
    return {
      migrationId,
      mode,
      sourceVersion: source.version,
      status: finalStatus,
      scanned: source.conversations.length + references.invalidManifests.length,
      planned: plans.filter((plan) => !plan.reason && plan.identity).length,
      migrated: records.filter(
        (record) => record.sourceKind === "conversation" && record.state === "migrated"
      ).length,
      quarantined,
      errorCount,
      backupManifestPath: backup?.path ?? null,
      cleanup,
      records,
    };
  } catch (error) {
    if (mode === "apply" && stateStarted) {
      const reason = error instanceof Error ? error.message : String(error);
      updateMigrationState(
        target,
        migrationId,
        source?.version ?? "unknown",
        "blocked",
        now,
        records.at(-1)?.sourceId ?? null,
        reason
      );
    }
    updateBackupManifest(backup, records);
    throw error;
  } finally {
    target.close();
  }
}
