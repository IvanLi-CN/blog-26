#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import path from "node:path";
import { extractPostDraftFields, normalizePostBody } from "../src/lib/post-body-contract";
import { computePostContentHash } from "../src/lib/post-body-contract-server";

type PostRow = {
  id: string;
  slug: string;
  type: string;
  title: string;
  excerpt: string | null;
  body: string;
  publish_date: number;
  update_date: number | null;
  draft: number;
  public: number;
  category: string | null;
  tags: string | null;
  author: string | null;
  image: string | null;
  metadata: string | null;
  data_source: string | null;
  content_hash: string;
  last_modified: number;
  source: string;
  file_path: string;
};

type Candidate = {
  id: string;
  slug: string;
  previousBody: string;
  nextBody: string;
  previousHash: string;
  nextHash: string;
  title: string;
  excerpt: string;
  category: string | null;
  author: string | null;
  image: string | null;
  publishDate: number | null;
  updateDate: number | null;
  tags: string[];
};

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || "./sqlite.db");

function parseStoredTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function loadCandidates(sqlite: Database): Candidate[] {
  const rows = sqlite
    .query(
      `SELECT id, slug, type, title, excerpt, body, publish_date, update_date, draft, public, category, tags, author, image, metadata, data_source, content_hash, last_modified, source, file_path
       FROM posts
       WHERE type = 'post'`
    )
    .all() as PostRow[];

  return rows
    .map((row) => {
      const normalized = normalizePostBody(row.body);
      if (!normalized.wasContaminated) {
        return null;
      }

      const extracted = extractPostDraftFields(row.body, {
        title: row.title,
        slug: row.slug,
        excerpt: row.excerpt,
        draft: Boolean(row.draft),
        public: Boolean(row.public),
        category: row.category,
        author: row.author,
        image: row.image,
        publishDate: row.publish_date,
        updateDate: row.update_date,
        tags: parseStoredTags(row.tags),
      });

      return {
        id: row.id,
        slug: row.slug,
        previousBody: row.body,
        nextBody: extracted.body,
        previousHash: row.content_hash,
        nextHash: computePostContentHash(extracted),
        title: extracted.title,
        excerpt: extracted.excerpt,
        category: extracted.category,
        author: extracted.author,
        image: extracted.image,
        publishDate: extracted.publishDate,
        updateDate: extracted.updateDate,
        tags: extracted.tags,
      } satisfies Candidate;
    })
    .filter((item): item is Candidate => Boolean(item));
}

function printSummary(candidates: Candidate[]) {
  const changedHashCount = candidates.filter((item) => item.previousHash !== item.nextHash).length;
  console.log(`DB_PATH=${dbPath}`);
  console.log(`mode=${shouldApply ? "apply" : "dry-run"}`);
  console.log(`affected_posts=${candidates.length}`);
  console.log(`content_hash_rewrites=${changedHashCount}`);
  console.log(
    `vectorize_slugs=${candidates.length > 0 ? candidates.map((item) => item.slug).join(",") : "-"}`
  );

  if (candidates.length > 0) {
    console.log("samples=");
    for (const candidate of candidates.slice(0, 5)) {
      console.log(
        `  - ${candidate.slug}: body=${JSON.stringify(candidate.previousBody.slice(0, 48))} -> ${JSON.stringify(candidate.nextBody.slice(0, 48))}, hash=${candidate.previousHash.slice(0, 8)} -> ${candidate.nextHash.slice(0, 8)}`
      );
    }
  }
}

function applyCandidates(sqlite: Database, candidates: Candidate[]) {
  const update = sqlite.query(
    `UPDATE posts
     SET title = ?,
         excerpt = ?,
         body = ?,
         category = ?,
         tags = ?,
         author = ?,
         image = ?,
         publish_date = ?,
         update_date = ?,
         content_hash = ?,
         last_modified = ?
     WHERE id = ?`
  );

  const now = Date.now();
  sqlite.run("BEGIN");
  try {
    for (const candidate of candidates) {
      update.run(
        candidate.title,
        candidate.excerpt,
        candidate.nextBody,
        candidate.category,
        JSON.stringify(candidate.tags),
        candidate.author,
        candidate.image,
        candidate.publishDate ?? now,
        candidate.updateDate ?? now,
        candidate.nextHash,
        now,
        candidate.id
      );
    }
    sqlite.run("COMMIT");
  } catch (error) {
    sqlite.run("ROLLBACK");
    throw error;
  }
}

function main() {
  const sqlite = new Database(dbPath);
  try {
    const candidates = loadCandidates(sqlite);
    printSummary(candidates);

    if (!shouldApply) {
      console.log("result=no-write");
      return;
    }

    applyCandidates(sqlite, candidates);
    console.log("result=applied");
  } finally {
    sqlite.close();
  }
}

main();
