import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "tmp/post-embeddings-foreign-key-test.sqlite");
const MIGRATION = path.join(process.cwd(), "drizzle/0038_post_embeddings_foreign_key.sql");

type Fixture = {
  seedPost(id: string): void;
  seedEmbedding(id: string, postId: string, chunkIndex?: number): void;
  embeddingIds(): string[];
};

function statements(): string[] {
  return fs
    .readFileSync(MIGRATION, "utf8")
    .split("--> statement-breakpoint")
    .map((sql) => sql.trim())
    .filter(Boolean);
}

function createFixture(): { sqlite: Database; fixture: Fixture } {
  const sqlite = new Database(DB_PATH);
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE posts (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL);
    CREATE TABLE post_embeddings (
      id TEXT PRIMARY KEY NOT NULL,
      post_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      type TEXT NOT NULL,
      model_name TEXT NOT NULL,
      dim INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      chunk_index INTEGER,
      vector BLOB,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX post_embeddings_uq_post_model_chunk
      ON post_embeddings (post_id, model_name, chunk_index);
    CREATE INDEX post_embeddings_idx_slug_model ON post_embeddings (slug, model_name);
    CREATE INDEX post_embeddings_idx_type_model ON post_embeddings (type, model_name);
  `);
  return {
    sqlite,
    fixture: {
      seedPost: (id) => sqlite.exec(`INSERT INTO posts (id, slug) VALUES ('${id}', '${id}')`),
      seedEmbedding: (id, postId, chunkIndex = -1) =>
        sqlite.exec(
          `INSERT INTO post_embeddings (id, post_id, slug, type, model_name, dim, content_hash, chunk_index, created_at, updated_at)
           VALUES ('${id}', '${postId}', '${postId}', 'post', 'm', 1, 'h', ${chunkIndex}, 1, 1)`
        ),
      embeddingIds: () =>
        (sqlite.query("SELECT id FROM post_embeddings ORDER BY id").all() as { id: string }[]).map(
          (row) => row.id
        ),
    },
  };
}

function applyMigration(sqlite: Database): void {
  sqlite.transaction(() => {
    for (const sql of statements()) sqlite.exec(sql);
  })();
}

describe("post_embeddings foreign key", () => {
  let sqlite: Database;
  let fixture: Fixture;

  beforeEach(() => {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
    ({ sqlite, fixture } = createFixture());
  });

  afterEach(() => {
    sqlite.close();
    if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  });

  it("declares a cascading reference to posts", () => {
    fixture.seedPost("post-a");
    applyMigration(sqlite);

    const keys = sqlite.query("PRAGMA foreign_key_list(post_embeddings)").all() as {
      table: string;
      from: string;
      on_delete: string;
    }[];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ table: "posts", from: "post_id", on_delete: "CASCADE" });
  });

  it("removes orphan vectors during the migration", () => {
    fixture.seedPost("post-a");
    fixture.seedEmbedding("emb-live", "post-a");
    fixture.seedEmbedding("emb-orphan", "deleted-post");

    applyMigration(sqlite);

    expect(fixture.embeddingIds()).toEqual(["emb-live"]);
  });

  it("cascades a post delete to its vectors", () => {
    fixture.seedPost("post-a");
    fixture.seedPost("post-b");
    fixture.seedEmbedding("emb-a0", "post-a", 0);
    fixture.seedEmbedding("emb-a1", "post-a", 1);
    fixture.seedEmbedding("emb-b0", "post-b");
    applyMigration(sqlite);
    expect(fixture.embeddingIds()).toHaveLength(3);

    sqlite.exec("DELETE FROM posts WHERE id = 'post-a'");

    expect(fixture.embeddingIds()).toEqual(["emb-b0"]);
  });

  it("rejects a vector whose post does not exist", () => {
    fixture.seedPost("post-a");
    applyMigration(sqlite);

    expect(() => fixture.seedEmbedding("emb-ghost", "missing-post")).toThrow(
      /FOREIGN KEY constraint failed/
    );
  });

  it("normalises legacy slash-prefixed post ids instead of dropping their vectors", () => {
    fixture.seedPost("post-a");
    fixture.seedEmbedding("emb-legacy", "/post-a");

    applyMigration(sqlite);

    const row = sqlite
      .query("SELECT post_id FROM post_embeddings WHERE id = 'emb-legacy'")
      .get() as { post_id: string } | null;
    expect(row?.post_id).toBe("post-a");
  });

  it("keeps the canonical row when a slashed twin duplicates it", () => {
    fixture.seedPost("post-a");
    fixture.seedEmbedding("emb-canonical", "post-a", 0);
    fixture.seedEmbedding("emb-legacy", "/post-a", 0);

    applyMigration(sqlite);

    expect(fixture.embeddingIds()).toEqual(["emb-canonical"]);
  });

  it("keeps a vector whose post id itself starts with a slash", () => {
    fixture.seedPost("/memos/memo-1.md");
    fixture.seedEmbedding("emb-slash-owner", "/memos/memo-1.md");

    applyMigration(sqlite);

    const row = sqlite
      .query("SELECT post_id FROM post_embeddings WHERE id = 'emb-slash-owner'")
      .get() as { post_id: string } | null;
    expect(row?.post_id).toBe("/memos/memo-1.md");
  });

  it("collapses two slashed twins that normalise to the same key", () => {
    fixture.seedPost("post-a");
    fixture.seedEmbedding("emb-double", "//post-a", 0);
    fixture.seedEmbedding("emb-single", "/post-a", 0);

    applyMigration(sqlite);

    expect(fixture.embeddingIds()).toEqual(["emb-double"]);
  });

  it("drops vectors whose normalised id still has no post", () => {
    fixture.seedPost("post-a");
    fixture.seedEmbedding("emb-live", "/post-a");
    fixture.seedEmbedding("emb-dead", "/deleted-post");

    applyMigration(sqlite);

    expect(fixture.embeddingIds()).toEqual(["emb-live"]);
  });
});
