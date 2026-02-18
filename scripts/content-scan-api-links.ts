#!/usr/bin/env bun

/**
 * Scan persisted content for `/api/files/...` references.
 *
 * This is a safety tool for Plan #0002 (persisted relative paths + FS-only readiness):
 * - Markdown on disk must not contain `/api/files/...`
 * - DB metadata/body must not contain `/api/files/...` (optional, via --include-db)
 *
 * Usage:
 *   bun run content:scan-api-links [--format human|json] [--fail-on-found] [--include-db]
 */

import { Database } from "bun:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";

type OutputFormat = "human" | "json";

type Sample = {
  kind: "markdown" | "db";
  file: string;
  match: string;
};

const API_RE =
  /\/api\/files\/(local|webdav)\/[A-Za-z0-9\-._~/%:@+]+(?:\?[^\s"'<>)]*)?(?:#[^\s"'<>)]*)?/g;

function parseArgs(argv: string[]) {
  const out = {
    format: "human" as OutputFormat,
    failOnFound: false,
    includeDb: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format") {
      const next = argv[i + 1];
      if (next !== "human" && next !== "json") {
        throw new Error(`Invalid --format: ${next ?? "(missing)"}`);
      }
      out.format = next;
      i++;
      continue;
    }
    if (arg === "--fail-on-found") {
      out.failOnFound = true;
      continue;
    }
    if (arg === "--include-db") {
      out.includeDb = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(
        [
          "bun run content:scan-api-links [--format human|json] [--fail-on-found] [--include-db]",
          "",
          "Environment:",
          "  LOCAL_CONTENT_BASE_PATH  Local content root to scan markdown files",
          "  DB_PATH                  SQLite DB path (required when --include-db)",
        ].join("\n")
      );
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${arg}`);
  }

  return out;
}

async function walkMarkdownFiles(rootAbs: string): Promise<string[]> {
  const out: string[] = [];

  const walk = async (dirAbs: string, relDir: string) => {
    const entries = await readdir(dirAbs, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      if (ent.isDirectory()) {
        if (ent.name === "node_modules") continue;
        await walk(join(dirAbs, ent.name), join(relDir, ent.name));
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith(".md")) continue;
      const rel = join(relDir, ent.name).replace(/\\/g, "/");
      out.push(rel);
    }
  };

  await walk(rootAbs, "");
  return out.sort();
}

function collectMatches(input: string): string[] {
  if (!input || typeof input !== "string") return [];
  return Array.from(input.matchAll(API_RE), (m) => m[0]);
}

function openReadonlyDb(dbPath: string): Database {
  const abs = resolvePath(process.cwd(), dbPath);
  return new Database(abs, { readonly: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const samples: Sample[] = [];
  const sampleLimit = 20;

  let markdownMatches = 0;
  let dbMatches = 0;

  const localBase = process.env.LOCAL_CONTENT_BASE_PATH?.trim();
  const shouldScanMarkdown = Boolean(localBase);
  const shouldScanDb = args.includeDb;

  if (!shouldScanMarkdown && !shouldScanDb) {
    throw new Error(
      "Nothing to scan: set LOCAL_CONTENT_BASE_PATH for markdown scanning or pass --include-db for DB scanning."
    );
  }

  if (shouldScanMarkdown) {
    if (!localBase) {
      throw new Error("LOCAL_CONTENT_BASE_PATH is required for markdown scanning.");
    }
    const rootAbs = resolvePath(process.cwd(), localBase);
    const files = await walkMarkdownFiles(rootAbs);
    for (const relPath of files) {
      const absPath = join(rootAbs, relPath);
      const content = await readFile(absPath, "utf8");
      const matches = collectMatches(content);
      if (matches.length === 0) continue;
      markdownMatches += matches.length;
      if (samples.length < sampleLimit) {
        samples.push({ kind: "markdown", file: relPath, match: matches[0] });
      }
    }
  }

  if (shouldScanDb) {
    const dbPath = process.env.DB_PATH?.trim();
    if (!dbPath) {
      throw new Error("DB_PATH is required when --include-db is enabled.");
    }
    const sqlite = openReadonlyDb(dbPath);
    try {
      const like = "%/api/files/%";
      const rows = sqlite
        .query(
          "SELECT id, file_path as filePath, body, metadata, image FROM posts WHERE body LIKE ? OR metadata LIKE ? OR image LIKE ?"
        )
        .all(like, like, like) as Array<{
        id: string;
        filePath: string | null;
        body: string | null;
        metadata: string | null;
        image: string | null;
      }>;

      for (const row of rows) {
        const id = row.id;
        for (const col of ["body", "metadata", "image"] as const) {
          const value = row[col];
          if (!value) continue;
          const matches = collectMatches(value);
          if (matches.length === 0) continue;
          dbMatches += matches.length;
          if (samples.length < sampleLimit) {
            samples.push({ kind: "db", file: `db:posts:${id}#${col}`, match: matches[0] });
          }
        }
      }
    } finally {
      sqlite.close();
    }
  }

  const found = markdownMatches + dbMatches > 0;

  if (args.format === "json") {
    const payload = {
      found,
      counts: { markdown: markdownMatches, db: dbMatches },
      samples,
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log("content:scan-api-links");
    console.log(`- LOCAL_CONTENT_BASE_PATH: ${localBase ?? "(not set)"}`);
    console.log(
      `- DB_PATH: ${args.includeDb ? (process.env.DB_PATH ?? "(not set)") : "(skipped)"}`
    );
    console.log(`- found: ${found}`);
    console.log(`- counts: markdown=${markdownMatches} db=${dbMatches}`);

    if (samples.length > 0) {
      console.log("\nSamples:");
      for (const s of samples) {
        console.log(`- [${s.kind}] ${s.file} -> ${s.match}`);
      }
    }
  }

  if (found && args.failOnFound) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
