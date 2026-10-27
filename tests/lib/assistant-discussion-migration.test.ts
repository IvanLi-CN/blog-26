import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ASSISTANT_DISCUSSION_MIGRATION_ID,
  migrateAssistantDiscussions,
} from "@/lib/assistant-discussion-migration";

const appFixturePath = path.resolve("tests/fixtures/site-assistant-legacy.sql");
const piFixturePath = path.resolve("tests/fixtures/site-assistant-pi-discussions.sql");
const legacyPiFixturePath = path.resolve("tests/fixtures/site-assistant-pi-legacy.sql");
const migrationPaths = [
  "drizzle/0011_memo_clipping.sql",
  "drizzle/0021_site_knowledge_assistant_contracts.sql",
  "drizzle/0022_frontend_session_auth_source.sql",
  "drizzle/0023_assistant_discussion_migration.sql",
].map((file) => path.resolve(file));

function applySqliteMigration(sqlite: Database, file: string) {
  for (const statement of fs
    .readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean)) {
    sqlite.exec(statement);
  }
}

function createTarget(directory: string) {
  const targetPath = path.join(directory, "sqlite.db");
  const sqlite = new Database(targetPath);
  sqlite.exec(fs.readFileSync(appFixturePath, "utf8"));
  for (const migrationPath of migrationPaths) applySqliteMigration(sqlite, migrationPath);
  sqlite
    .query(
      "INSERT INTO frontend_users (id, is_admin, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run("frontend-reader", 0, "Legacy Reader", "/avatar.svg", 1, 1);
  sqlite
    .query(
      `INSERT INTO frontend_identity_links
        (id, frontend_user_id, provider, provider_subject, provider_login, reader_id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "identity-link",
      "frontend-reader",
      "github",
      "github-legacy-reader",
      "legacy-reader",
      "legacy-reader",
      "Legacy Reader",
      1,
      1
    );
  const manifest = JSON.stringify({
    schemaVersion: 1,
    id: "clip-1",
    memoId: "memo.md",
    creatorId: "legacy-reader",
    revision: 2,
    enabled: true,
    deleted: false,
    targetUrl: "https://example.test/current",
    conversationId: "1",
    previousConversations: [{ targetUrl: "https://example.test/legacy", conversationId: "2" }],
    currentVersionId: "version-current",
    activeVersionId: "version-current",
    versions: [
      {
        id: "version-current",
        revision: 2,
        targetUrl: "https://example.test/current",
        createdAt: 2,
        status: "completed",
        summaryState: "completed",
        translationState: "completed",
      },
      {
        id: "version-legacy",
        revision: 1,
        targetUrl: "https://example.test/legacy",
        createdAt: 1,
        status: "completed",
        summaryState: "completed",
        translationState: "completed",
      },
    ],
  });
  sqlite
    .query(
      `INSERT INTO memo_clippings
        (id, memo_id, creator_id, revision, enabled, deleted, target_url, current_version_id, conversation_id, manifest, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "clip-1",
      "memo.md",
      "legacy-reader",
      2,
      1,
      0,
      "https://example.test/current",
      "version-current",
      "1",
      manifest,
      2
    );
  sqlite.close();
  return targetPath;
}

function createPi(directory: string, fixture = piFixturePath) {
  const piPath = path.join(directory, "pi-durable.sqlite");
  const sqlite = new Database(piPath);
  sqlite.exec(fs.readFileSync(fixture, "utf8"));
  sqlite.close();
  return piPath;
}

function addIdentityAndReferenceForLegacy(targetPath: string) {
  const sqlite = new Database(targetPath);
  sqlite
    .query(
      "UPDATE memo_clippings SET conversation_id = ?, current_version_id = ?, target_url = ?, manifest = ?"
    )
    .run(
      "7",
      "version-legacy",
      "https://example.test/legacy",
      JSON.stringify({
        schemaVersion: 1,
        id: "clip-1",
        memoId: "memo.md",
        creatorId: "legacy-reader",
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.test/legacy",
        conversationId: "7",
        previousConversations: [],
        currentVersionId: "version-legacy",
        activeVersionId: "version-legacy",
        versions: [
          {
            id: "version-legacy",
            revision: 1,
            targetUrl: "https://example.test/legacy",
            createdAt: 1,
            status: "completed",
            summaryState: "completed",
            translationState: "completed",
          },
        ],
      })
    );
  sqlite.close();
}

function withTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "site-assistant-discussion-migration-"));
}

const trustedReader = async () => "legacy-reader";

describe("assistant discussion migration", () => {
  it("dry-runs and then migrates current and legacy target discussions with partial output", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      const backupDir = path.join(directory, "backups");
      const dryRun = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        backupDir,
        now: () => 10_000,
        resolveTrustedCreator: trustedReader,
      });
      expect(dryRun.status).toBe("dry-run");
      expect(dryRun.planned).toBe(2);
      expect(dryRun.backupManifestPath).toBe(path.join(backupDir, "backup-manifest.json"));
      const beforeApply = new Database(targetPath);
      expect(
        beforeApply.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()
      ).toEqual({ count: 0 });
      expect(
        beforeApply.query("SELECT COUNT(*) AS count FROM assistant_migration_state").get()
      ).toEqual({ count: 0 });
      beforeApply.close();

      const applied = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        backupDir,
        now: () => 10_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(applied.status).toBe("complete");
      expect(applied.migrated).toBe(2);
      expect(applied.cleanup.removed).toEqual([]);
      const target = new Database(targetPath);
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()).toEqual({
        count: 2,
      });
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_messages").get()).toEqual({
        count: 7,
      });
      expect(
        target
          .query(
            "SELECT clipping_version_id FROM assistant_conversations WHERE clipping_memo_id = ? AND clipping_version_id IS NOT NULL"
          )
          .get("memo.md")
      ).toBeTruthy();
      expect(
        target
          .query("SELECT content FROM assistant_messages WHERE content = ?")
          .get("Partial answer")
      ).toBeTruthy();
      expect(
        target
          .query("SELECT role, content FROM assistant_messages WHERE content LIKE ?")
          .get("%Article context from prompt sections%")
      ).toEqual({
        role: "system",
        content: "<reading-context>Article context from prompt sections</reading-context>",
      });
      expect(
        target.query("SELECT COUNT(*) AS count FROM assistant_migration_backups").get()
      ).toEqual({ count: 1 });
      target.close();
      const manifest = JSON.parse(
        fs.readFileSync(applied.backupManifestPath as string, "utf8")
      ) as {
        files: Array<{ copied: boolean; sha256: string }>;
      };
      expect(manifest.files[0]?.copied).toBe(true);
      expect(manifest.files[0]?.sha256).toHaveLength(64);

      const rerun = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        backupDir,
        now: () => 10_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(rerun.status).toBe("complete");
      const afterRerun = new Database(targetPath);
      expect(
        afterRerun.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()
      ).toEqual({ count: 2 });
      expect(afterRerun.query("SELECT COUNT(*) AS count FROM assistant_messages").get()).toEqual({
        count: 7,
      });
      afterRerun.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps the completed current version during same-target reprocessing and repeated apply", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      const initial = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 15_000,
        resolveTrustedCreator: trustedReader,
      });
      expect(initial.status).toBe("complete");

      const target = new Database(targetPath);
      target.query("UPDATE memo_clippings SET manifest = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify({
          schemaVersion: 1,
          id: "clip-1",
          memoId: "memo.md",
          creatorId: "legacy-reader",
          revision: 3,
          enabled: true,
          deleted: false,
          targetUrl: "https://example.test/current",
          conversationId: "1",
          previousConversations: [
            { targetUrl: "https://example.test/legacy", conversationId: "2" },
          ],
          currentVersionId: "version-current",
          activeVersionId: "version-reprocess",
          versions: [
            {
              id: "version-current",
              revision: 2,
              targetUrl: "https://example.test/current",
              createdAt: 2,
              status: "completed",
              summaryState: "completed",
              translationState: "completed",
            },
            {
              id: "version-reprocess",
              revision: 3,
              targetUrl: "https://example.test/current",
              createdAt: 3,
              status: "queued",
              summaryState: "pending",
              translationState: "pending",
            },
          ],
        }),
        3,
        "clip-1"
      );
      target.close();

      const reprocess = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 15_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(reprocess.status).toBe("complete");
      expect(reprocess.cleanup.removed).toEqual([]);
      expect(reprocess.cleanup.skipped).toHaveLength(2);
      expect(reprocess.cleanup.skipped.every((item) => item.reason === "clipping-processing")).toBe(
        true
      );

      const repeated = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 15_002,
        resolveTrustedCreator: trustedReader,
      });
      expect(repeated.status).toBe("complete");
      const after = new Database(targetPath);
      const clippingVersionIds = after
        .query<{ clipping_version_id: string | null }, [string]>(
          "SELECT clipping_version_id FROM assistant_conversations WHERE clipping_memo_id = ? ORDER BY id"
        )
        .all("memo.md")
        .map((row) => row.clipping_version_id);
      expect(clippingVersionIds).toHaveLength(2);
      expect(clippingVersionIds).toEqual(expect.arrayContaining(["version-current", null]));
      expect(after.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()).toEqual({
        count: 2,
      });
      expect(after.query("SELECT COUNT(*) AS count FROM assistant_messages").get()).toEqual({
        count: 7,
      });
      const beforeConversationIds = after
        .query<{ id: string }, [string]>(
          "SELECT id FROM assistant_conversations WHERE clipping_memo_id = ? ORDER BY id"
        )
        .all("memo.md")
        .map((row) => row.id);
      const beforeConversationLedgers = after
        .query<{ source_id: string; source_hash: string; target_id: string | null }, [string]>(
          "SELECT source_id, source_hash, target_id FROM assistant_migration_items WHERE migration_id = ? AND source_kind = 'conversation' ORDER BY source_id"
        )
        .all(ASSISTANT_DISCUSSION_MIGRATION_ID);
      after.close();

      const completedTarget = new Database(targetPath);
      completedTarget
        .query("UPDATE memo_clippings SET manifest = ?, updated_at = ? WHERE id = ?")
        .run(
          JSON.stringify({
            schemaVersion: 1,
            id: "clip-1",
            memoId: "memo.md",
            creatorId: "legacy-reader",
            revision: 3,
            enabled: true,
            deleted: false,
            targetUrl: "https://example.test/current",
            conversationId: "1",
            previousConversations: [
              { targetUrl: "https://example.test/legacy", conversationId: "2" },
            ],
            currentVersionId: "version-reprocess",
            activeVersionId: "version-reprocess",
            versions: [
              {
                id: "version-current",
                revision: 2,
                targetUrl: "https://example.test/current",
                createdAt: 2,
                status: "completed",
                summaryState: "completed",
                translationState: "completed",
              },
              {
                id: "version-reprocess",
                revision: 3,
                targetUrl: "https://example.test/current",
                createdAt: 3,
                status: "completed",
                summaryState: "completed",
                translationState: "completed",
              },
            ],
          }),
          4,
          "clip-1"
        );
      completedTarget.close();

      const completedTransition = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 15_003,
        resolveTrustedCreator: trustedReader,
      });
      expect(completedTransition.status).toBe("complete");
      const transitioned = new Database(targetPath);
      const transitionedBindings = transitioned
        .query<{ source_id: string; source_hash: string; target_id: string | null }, [string]>(
          "SELECT source_id, source_hash, target_id FROM assistant_migration_items WHERE migration_id = ? AND source_kind = 'conversation' ORDER BY source_id"
        )
        .all(ASSISTANT_DISCUSSION_MIGRATION_ID);
      expect(transitionedBindings).toEqual(beforeConversationLedgers);
      expect(transitionedBindings.map((row) => row.target_id).sort()).toEqual(
        beforeConversationIds
      );
      const transitionedVersionIds = transitioned
        .query<{ clipping_version_id: string | null }, [string]>(
          "SELECT clipping_version_id FROM assistant_conversations WHERE clipping_memo_id = ? ORDER BY id"
        )
        .all("memo.md")
        .map((row) => row.clipping_version_id);
      expect(transitionedVersionIds).toEqual(expect.arrayContaining(["version-reprocess", null]));
      transitioned.close();

      const conflictingTarget = new Database(targetPath);
      const currentManifestRow = conflictingTarget
        .query<{ manifest: string }, [string]>("SELECT manifest FROM memo_clippings WHERE id = ?")
        .get("clip-1");
      const currentManifest = JSON.parse(currentManifestRow?.manifest ?? "{}") as Record<
        string,
        unknown
      >;
      conflictingTarget
        .query(
          "UPDATE memo_clippings SET target_url = ?, manifest = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          "https://example.test/other",
          JSON.stringify({ ...currentManifest, targetUrl: "https://example.test/other" }),
          5,
          "clip-1"
        );
      conflictingTarget.close();

      const conflict = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 15_004,
        resolveTrustedCreator: trustedReader,
      });
      expect(conflict.status).toBe("blocked");
      expect(
        conflict.records.some((record) => record.reason === "existing-target-conversation-conflict")
      ).toBe(true);
      const preserved = new Database(targetPath);
      expect(
        preserved
          .query<{ clipping_version_id: string | null }, [string]>(
            "SELECT clipping_version_id FROM assistant_conversations WHERE clipping_memo_id = ? AND clipping_version_id IS NOT NULL"
          )
          .get("memo.md")
      ).toEqual({ clipping_version_id: "version-reprocess" });
      const preservedLedger = preserved
        .query<{ payload: string }, [string]>(
          "SELECT payload FROM assistant_migration_items WHERE migration_id = ? AND source_kind = 'conversation' AND source_id LIKE '%:conversation:1'"
        )
        .get(ASSISTANT_DISCUSSION_MIGRATION_ID);
      const preservedPayload = JSON.parse(preservedLedger?.payload ?? "{}") as {
        reference?: { targetUrl?: string | null };
      };
      expect(preservedPayload.reference?.targetUrl).toBe("https://example.test/current");
      preserved.close();

      const restoredTarget = new Database(targetPath);
      restoredTarget
        .query(
          "UPDATE memo_clippings SET target_url = ?, manifest = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          "https://example.test/current",
          JSON.stringify({ ...currentManifest, targetUrl: "https://example.test/current" }),
          6,
          "clip-1"
        );
      restoredTarget.close();

      const repeatedCompleted = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 15_005,
        resolveTrustedCreator: trustedReader,
      });
      expect(repeatedCompleted.status).toBe("complete");
      expect(repeatedCompleted.cleanup.removed).toHaveLength(2);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("resumes after an interruption without duplicating the completed conversation", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      await expect(
        migrateAssistantDiscussions({
          targetDbPath: targetPath,
          piDbPath: piPath,
          mode: "apply",
          now: () => 20_000,
          resolveTrustedCreator: trustedReader,
          failAfter: 1,
        })
      ).rejects.toThrow("injected-migration-interruption");
      const blocked = new Database(targetPath);
      expect(
        blocked
          .query("SELECT status, migrated FROM assistant_migration_state WHERE id = ?")
          .get("site-assistant-discussions-v1")
      ).toEqual({
        status: "blocked",
        migrated: 1,
      });
      blocked.close();
      const resumed = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 20_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(resumed.status).toBe("complete");
      const target = new Database(targetPath);
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()).toEqual({
        count: 2,
      });
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_messages").get()).toEqual({
        count: 7,
      });
      target.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("settles a copied partial when Pi later commits the final assistant entry", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 25_000,
        resolveTrustedCreator: trustedReader,
      });

      const source = new Database(piPath);
      source.query("DELETE FROM documents WHERE id = ?").run(81);
      source
        .query(
          "INSERT INTO entries (id, conversation_id, head, commit_seq, record) VALUES (?, ?, ?, ?, ?)"
        )
        .run(
          14,
          1,
          null,
          6,
          '{"id":14,"conversationId":1,"kind":"pi.assistant","model":[{"role":"assistant","content":"The settled answer.","timestamp":4000,"stopReason":"stop"}]}'
        );
      source.close();

      const resumed = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 25_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(resumed.status).toBe("complete");
      const target = new Database(targetPath);
      expect(
        target
          .query("SELECT status FROM assistant_messages WHERE content = ?")
          .get("Partial answer")
      ).toEqual({ status: "cancelled" });
      expect(
        target
          .query("SELECT status FROM assistant_messages WHERE content = ?")
          .get("The settled answer.")
      ).toEqual({ status: "completed" });
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_messages").get()).toEqual({
        count: 8,
      });
      target.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("quarantines unknown attribution and preserves the raw source payload", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      const source = new Database(piPath);
      source
        .query("INSERT INTO conversations (id, record) VALUES (?, ?)")
        .run(3, '{"id":3,"unreferenced":true}');
      source.close();
      const report = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 30_000,
        resolveTrustedCreator: async (reference) =>
          reference.sourceConversationId === 3 ? null : "legacy-reader",
      });
      expect(report.status).toBe("blocked");
      expect(report.quarantined).toBe(1);
      const target = new Database(targetPath);
      const row = target
        .query<{ state: string; reason: string; payload: string }, []>(
          "SELECT state, reason, payload FROM assistant_migration_items WHERE source_id LIKE '%:conversation:3'"
        )
        .get();
      expect(row?.state).toBe("quarantined");
      expect(row?.reason).toBe("unreferenced-conversation");
      expect(row?.payload).toContain('"unreferenced":true');
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()).toEqual({
        count: 2,
      });
      target.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("restores a migrated conversation after temporary attribution quarantine", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      const initial = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 35_000,
        resolveTrustedCreator: trustedReader,
      });
      expect(initial.status).toBe("complete");

      let attributionTrusted = false;
      const quarantined = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 35_001,
        resolveTrustedCreator: async () => (attributionTrusted ? "legacy-reader" : null),
      });
      expect(quarantined.status).toBe("blocked");
      expect(quarantined.quarantined).toBe(2);

      const quarantinedTarget = new Database(targetPath);
      const quarantinedLedger = quarantinedTarget
        .query<{ state: string; target_id: string | null; payload: string }, [string]>(
          "SELECT state, target_id, payload FROM assistant_migration_items WHERE migration_id = ? AND source_kind = 'conversation' AND source_id LIKE '%:conversation:1'"
        )
        .get(ASSISTANT_DISCUSSION_MIGRATION_ID);
      expect(quarantinedLedger?.state).toBe("quarantined");
      expect(quarantinedLedger?.target_id).toBeTruthy();
      const quarantinedPayload = JSON.parse(quarantinedLedger?.payload ?? "{}") as {
        reference?: { targetUrl?: string | null };
        trustedBinding?: { targetId?: string | null; sourceHash?: string };
      };
      expect(quarantinedPayload.reference?.targetUrl).toBe("https://example.test/current");
      expect(quarantinedPayload.trustedBinding?.targetId).toBe(quarantinedLedger?.target_id);
      expect(quarantinedPayload.trustedBinding?.sourceHash).toBeTruthy();
      quarantinedTarget.close();

      attributionTrusted = true;
      const restored = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 35_002,
        resolveTrustedCreator: async () => (attributionTrusted ? "legacy-reader" : null),
      });
      expect(restored.status).toBe("complete");
      const restoredTarget = new Database(targetPath);
      const restoredLedger = restoredTarget
        .query<{ state: string; target_id: string | null }, [string]>(
          "SELECT state, target_id FROM assistant_migration_items WHERE migration_id = ? AND source_kind = 'conversation' AND source_id LIKE '%:conversation:1'"
        )
        .get(ASSISTANT_DISCUSSION_MIGRATION_ID);
      expect(restoredLedger).toEqual({
        state: "migrated",
        target_id: quarantinedLedger?.target_id,
      });
      expect(
        restoredTarget.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()
      ).toEqual({
        count: 2,
      });
      expect(
        restoredTarget.query("SELECT COUNT(*) AS count FROM assistant_messages").get()
      ).toEqual({
        count: 7,
      });
      restoredTarget.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocks cleanup while clipping work is processing and cleans only after verification", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      const source = new Database(piPath);
      source
        .query(
          "INSERT INTO tasks (id, conversation_id, kind, status, abort_requested, background, record) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(91, 1, "pi.generation", "running", 0, 0, '{"id":91,"state":{"status":"running"}}');
      source.close();
      const protectedRun = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 40_000,
        resolveTrustedCreator: trustedReader,
      });
      expect(protectedRun.cleanup.verified).toBe(true);
      expect(
        protectedRun.cleanup.skipped.some((item) => item.reason.includes("active-task:91"))
      ).toBe(true);
      expect(protectedRun.cleanup.removed.some((item) => item.endsWith(":conversation:2"))).toBe(
        true
      );
      const stillThere = new Database(piPath);
      expect(
        stillThere.query("SELECT COUNT(*) AS count FROM conversations WHERE id = ?").get(1)
      ).toEqual({ count: 1 });
      expect(
        stillThere.query("SELECT COUNT(*) AS count FROM conversations WHERE id = ?").get(2)
      ).toEqual({ count: 0 });
      stillThere.close();

      const clearTask = new Database(piPath);
      clearTask.query("UPDATE tasks SET status = 'terminal' WHERE id = ?").run(91);
      clearTask.close();
      const cleaned = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 40_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(cleaned.cleanup.removed.some((item) => item.endsWith(":conversation:1"))).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses cleanup when archived system context is corrupted", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 45_000,
        resolveTrustedCreator: trustedReader,
      });

      const corrupt = new Database(targetPath);
      corrupt
        .query("UPDATE assistant_messages SET content = ? WHERE content LIKE ?")
        .run("Corrupted reading context", "%Article context from prompt sections%");
      corrupt.close();

      const blocked = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 45_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(blocked.status).toBe("blocked");
      expect(blocked.cleanup.verified).toBe(false);
      expect(blocked.cleanup.removed).toEqual([]);
      const source = new Database(piPath);
      expect(source.query("SELECT COUNT(*) AS count FROM conversations").get()).toEqual({
        count: 2,
      });
      source.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("binds the active target version and protects cleanup during version processing", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      const target = new Database(targetPath);
      target
        .query(
          "UPDATE memo_clippings SET target_url = ?, current_version_id = ?, manifest = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          "https://example.test/next",
          "version-current",
          JSON.stringify({
            schemaVersion: 1,
            id: "clip-1",
            memoId: "memo.md",
            creatorId: "legacy-reader",
            revision: 3,
            enabled: true,
            deleted: false,
            targetUrl: "https://example.test/next",
            conversationId: "1",
            previousConversations: [
              { targetUrl: "https://example.test/current", conversationId: "2" },
            ],
            currentVersionId: "version-current",
            activeVersionId: "version-processing",
            versions: [
              {
                id: "version-current",
                revision: 2,
                targetUrl: "https://example.test/current",
                createdAt: 2,
                status: "completed",
                summaryState: "completed",
                translationState: "completed",
              },
              {
                id: "version-processing",
                revision: 3,
                targetUrl: "https://example.test/next",
                createdAt: 3,
                status: "processing",
                summaryState: "pending",
                translationState: "pending",
              },
            ],
          }),
          3,
          "clip-1"
        );
      target.close();

      const report = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 46_000,
        resolveTrustedCreator: trustedReader,
      });
      expect(report.status).toBe("complete");
      expect(report.cleanup.removed).toEqual([]);
      expect(report.cleanup.skipped).toHaveLength(2);
      expect(report.cleanup.skipped.every((item) => item.reason === "clipping-processing")).toBe(
        true
      );

      const migrated = new Database(targetPath);
      const clippingVersionIds = migrated
        .query<{ clipping_version_id: string | null }, []>(
          "SELECT clipping_version_id FROM assistant_conversations ORDER BY id"
        )
        .all()
        .map((row) => row.clipping_version_id);
      expect(clippingVersionIds).toHaveLength(2);
      expect(clippingVersionIds.every((versionId) => versionId === null)).toBe(true);
      migrated.close();
      const source = new Database(piPath);
      expect(source.query("SELECT COUNT(*) AS count FROM conversations").get()).toEqual({
        count: 2,
      });
      source.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves the old target when an immutable source entry hash changes", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 50_000,
        resolveTrustedCreator: trustedReader,
      });
      const source = new Database(piPath);
      source
        .query("UPDATE entries SET record = ? WHERE id = ?")
        .run(
          '{"id":11,"conversationId":1,"kind":"pi.user","model":[{"role":"user","content":"Tampered question","timestamp":1000}]}',
          11
        );
      source.close();
      const report = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 50_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(report.status).toBe("blocked");
      const target = new Database(targetPath);
      expect(
        target
          .query("SELECT content FROM assistant_messages WHERE content = ?")
          .get("What is current?")
      ).toBeTruthy();
      expect(
        target
          .query("SELECT content FROM assistant_messages WHERE content = ?")
          .get("Tampered question")
      ).toBeNull();
      expect(
        target
          .query(
            "SELECT state, reason FROM assistant_migration_items WHERE source_kind = 'conversation' AND source_id LIKE '%:conversation:1'"
          )
          .get()
      ).toEqual({ state: "failed", reason: "source-entry-hash-conflict" });
      target.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses cleanup after target verification fails, then resumes after repair", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory);
      await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 55_000,
        resolveTrustedCreator: trustedReader,
      });
      const corrupt = new Database(targetPath);
      corrupt
        .query("UPDATE assistant_messages SET content = ? WHERE content = ?")
        .run("Corrupted target", "The current answer.");
      corrupt.close();
      const ordinary = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 55_001,
        resolveTrustedCreator: trustedReader,
      });
      expect(ordinary.status).toBe("blocked");
      expect(ordinary.cleanup.requested).toBe(false);
      const blockedState = new Database(targetPath);
      expect(
        blockedState
          .query<{ status: string; last_error: string | null }, [string]>(
            "SELECT status, last_error FROM assistant_migration_state WHERE id = ?"
          )
          .get("site-assistant-discussions-v1")
      ).toMatchObject({ status: "blocked" });
      blockedState.close();
      const blocked = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 55_002,
        resolveTrustedCreator: trustedReader,
      });
      expect(blocked.status).toBe("blocked");
      expect(blocked.cleanup.verified).toBe(false);
      expect(blocked.cleanup.skipped.every((item) => item.reason === "verification-failed")).toBe(
        true
      );
      const sourceStillPresent = new Database(piPath);
      expect(sourceStillPresent.query("SELECT COUNT(*) AS count FROM conversations").get()).toEqual(
        { count: 2 }
      );
      sourceStillPresent.close();

      const repair = new Database(targetPath);
      repair
        .query("UPDATE assistant_messages SET content = ? WHERE content = ?")
        .run("The current answer.", "Corrupted target");
      repair.close();
      const cleaned = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        cleanup: true,
        now: () => 55_003,
        resolveTrustedCreator: trustedReader,
      });
      expect(cleaned.status).toBe("complete");
      expect(cleaned.cleanup.removed).toHaveLength(2);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reads a legacy Pi source without durable schema or task tables", async () => {
    const directory = withTempDirectory();
    try {
      const targetPath = createTarget(directory);
      const piPath = createPi(directory, legacyPiFixturePath);
      addIdentityAndReferenceForLegacy(targetPath);
      const report = await migrateAssistantDiscussions({
        targetDbPath: targetPath,
        piDbPath: piPath,
        mode: "apply",
        now: () => 60_000,
        resolveTrustedCreator: trustedReader,
      });
      expect(report.status).toBe("complete");
      expect(report.sourceVersion).toBe("pi-durable-legacy");
      const target = new Database(targetPath);
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_conversations").get()).toEqual({
        count: 1,
      });
      expect(target.query("SELECT COUNT(*) AS count FROM assistant_messages").get()).toEqual({
        count: 2,
      });
      target.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
