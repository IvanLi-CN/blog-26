import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

// Supported 2.7.0 ends at 0010; supported 2.8.3 through 2.12.0 end at 0011.
test.each([10, 11])(
  "upgrades SQLite through migration %i without DDL backfill",
  (lastMigration) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "blog-search-migration-"));
    const legacyFolder = path.join(directory, "legacy-migrations");
    mkdirSync(path.join(legacyFolder, "meta"), { recursive: true });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    journal.entries = journal.entries.filter(
      (entry: { idx: number }) => entry.idx <= lastMigration
    );
    writeFileSync(path.join(legacyFolder, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) {
      copyFileSync(`drizzle/${entry.tag}.sql`, path.join(legacyFolder, `${entry.tag}.sql`));
    }
    const sqlite = new Database(path.join(directory, "content.sqlite"));
    try {
      const database = drizzle(sqlite);
      migrate(database, { migrationsFolder: legacyFolder });
      sqlite.run(
        "INSERT INTO posts(id,slug,type,title,body,publish_date,update_date,draft,public,data_source,content_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [
          "historical",
          "historical",
          "post",
          "Arch Linux",
          "这篇文章介绍 Arch Linux",
          1,
          1,
          0,
          1,
          "local",
          "original",
        ]
      );
      const before = sqlite.query("SELECT * FROM posts WHERE id='historical'").get();
      migrate(database, { migrationsFolder: "drizzle" });
      migrate(database, { migrationsFolder: "drizzle" });
      expect(sqlite.query("SELECT * FROM posts WHERE id='historical'").get()).toEqual(before);
      expect(sqlite.query("SELECT count(*) AS n FROM search_content_versions").get()).toEqual({
        n: 0,
      });
      expect(sqlite.query("SELECT count(*) AS n FROM search_outbox").get()).toEqual({ n: 0 });
      expect(sqlite.query("SELECT count(*) AS n FROM search_index_state").get()).toEqual({ n: 0 });
      const semanticColumns = sqlite
        .query("PRAGMA table_info(search_semantic_embeddings)")
        .all()
        .map((column: { name: string }) => column.name);
      expect(semanticColumns).toEqual(
        expect.arrayContaining([
          "source",
          "parent_id",
          "edition_digest",
          "source_release_id",
          "source_tag",
          "model_name",
          "chunk_index",
          "content_hash",
          "status",
        ])
      );
      expect(
        sqlite
          .query(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'search_semantic_embeddings_%'"
          )
          .all()
          .map((index: { name: string }) => index.name)
      ).toEqual(
        expect.arrayContaining([
          "search_semantic_embeddings_identity",
          "search_semantic_embeddings_source_model_idx",
          "search_semantic_embeddings_edition_idx",
        ])
      );
      expect(
        sqlite
          .query("SELECT count(*) AS n FROM posts_search_fts WHERE posts_search_fts MATCH 'Arch'")
          .get()
      ).toEqual({ n: 1 });
      sqlite.run("UPDATE posts SET title='Arch updated' WHERE id='historical'");
      expect(sqlite.query("SELECT operation FROM search_outbox").all()).toEqual([
        { operation: "upsert" },
      ]);
      expect(
        sqlite
          .query("SELECT version FROM search_content_versions WHERE content_id='historical'")
          .get()
      ).toEqual({ version: 1 });
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
);

test("repairs duplicate running job records before installing the single-flight index", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "blog-job-run-migration-"));
  const legacyFolder = path.join(directory, "legacy-migrations");
  mkdirSync(path.join(legacyFolder, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 25);
  writeFileSync(path.join(legacyFolder, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) {
    copyFileSync(`drizzle/${entry.tag}.sql`, path.join(legacyFolder, `${entry.tag}.sql`));
  }

  const sqlite = new Database(path.join(directory, "content.sqlite"));
  try {
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: legacyFolder });
    const startedAt = Date.now();
    const insert = sqlite.query(
      "INSERT INTO job_runs(id,job_key,job_name,status,triggered_by,attempt,started_at,log_path,log_deleted) VALUES(?,?,?,?,?,?,?,?,?)"
    );
    insert.run(
      "old-running",
      "project-entry-status",
      "项目入口状态检查",
      "running",
      "scheduler",
      1,
      startedAt - 1_000,
      "/tmp/old-running.log",
      0
    );
    insert.run(
      "new-running",
      "project-entry-status",
      "项目入口状态检查",
      "running",
      "scheduler",
      1,
      startedAt,
      "/tmp/new-running.log",
      0
    );

    migrate(database, { migrationsFolder: "drizzle" });

    expect(
      sqlite
        .query(
          "SELECT id,status,error_message FROM job_runs WHERE job_key='project-entry-status' ORDER BY id"
        )
        .all()
    ).toEqual([
      {
        id: "new-running",
        status: "running",
        error_message: null,
      },
      {
        id: "old-running",
        status: "error",
        error_message: "迁移时回收了重复的未完成任务",
      },
    ]);
    expect(
      sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='job_runs_uq_running_job'"
        )
        .get()
    ).toEqual({ name: "job_runs_uq_running_job" });
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
