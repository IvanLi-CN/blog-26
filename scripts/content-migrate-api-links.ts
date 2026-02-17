#!/usr/bin/env bun

/**
 * Migrate persisted `/api/files/...` references to persisted relative paths.
 *
 * Usage:
 *   bun run content:migrate-api-links [--dry-run] [--apply] --backup-dir <dir> [--include-db]
 *
 * Notes:
 * - When --apply is used, --backup-dir is required.
 * - Markdown scanning/migration requires LOCAL_CONTENT_BASE_PATH.
 * - DB scanning/migration requires DB_PATH when --include-db is enabled.
 */

import { Database } from "bun:sqlite";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { normalizePersistedLink, rewriteApiFilesUrlsToRelative } from "../src/lib/persisted-paths";

type ChangeSample = {
  kind: "markdown" | "db";
  target: string;
  before: string;
  after: string;
};

const API_RE =
  /\/api\/files\/(local|webdav)\/[A-Za-z0-9\-._~/%:@+]+(?:\?[^\s"'<>)]*)?(?:#[^\s"'<>)]*)?/g;

function parseArgs(argv: string[]) {
  const out = {
    apply: false,
    dryRun: true,
    backupDir: "" as string,
    includeDb: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      out.apply = true;
      out.dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      out.apply = false;
      continue;
    }
    if (arg === "--backup-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --backup-dir");
      out.backupDir = next;
      i++;
      continue;
    }
    if (arg === "--include-db") {
      out.includeDb = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(
        [
          "bun run content:migrate-api-links [--dry-run] [--apply] --backup-dir <dir> [--include-db]",
          "",
          "Environment:",
          "  LOCAL_CONTENT_BASE_PATH  Local content root to migrate markdown files",
          "  DB_PATH                  SQLite DB path (required when --include-db)",
        ].join("\n")
      );
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${arg}`);
  }

  if (out.apply && !out.backupDir) {
    const err: any = new Error("--apply requires --backup-dir <dir>");
    err.exitCode = 2;
    throw err;
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

function firstMatch(input: string): string | null {
  const m = API_RE.exec(input);
  // Reset global regex state to keep this helper reusable.
  API_RE.lastIndex = 0;
  return m ? m[0] : null;
}

function openDb(dbPath: string, readonly: boolean): Database {
  const abs = resolvePath(process.cwd(), dbPath);
  return new Database(abs, { readonly });
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

async function backupFile(opts: { backupDirAbs: string; relPath: string; srcAbs: string }) {
  const destAbs = join(opts.backupDirAbs, "markdown", opts.relPath);
  await ensureDir(join(destAbs, ".."));
  await copyFile(opts.srcAbs, destAbs);
}

async function backupDbFile(opts: { backupDirAbs: string; dbPath: string }) {
  const srcAbs = resolvePath(process.cwd(), opts.dbPath);
  const destAbs = join(opts.backupDirAbs, "db.sqlite");
  await ensureDir(opts.backupDirAbs);
  await copyFile(srcAbs, destAbs);
}

function normalizeMetadataAttachments(
  metadata: unknown,
  markdownFilePath: string
): { normalized: unknown; didChange: boolean } {
  if (!metadata || typeof metadata !== "object") {
    return { normalized: metadata, didChange: false };
  }

  const meta: any = metadata as any;
  if (!Array.isArray(meta.attachments)) {
    return { normalized: metadata, didChange: false };
  }

  let didChange = false;
  meta.attachments = meta.attachments.map((att: any) => {
    if (!att || typeof att !== "object") return att;
    if (typeof att.path !== "string" || att.path.length === 0) return att;
    try {
      const next = normalizePersistedLink(att.path, markdownFilePath);
      if (next !== att.path) didChange = true;
      return next === att.path ? att : { ...att, path: next };
    } catch {
      return att;
    }
  });

  return { normalized: meta, didChange };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const localBase = process.env.LOCAL_CONTENT_BASE_PATH?.trim();
  const shouldMigrateMarkdown = Boolean(localBase);
  const shouldMigrateDb = args.includeDb;

  if (!shouldMigrateMarkdown && !shouldMigrateDb) {
    throw new Error(
      "Nothing to migrate: set LOCAL_CONTENT_BASE_PATH for markdown migration or pass --include-db for DB migration."
    );
  }

  const backupDirAbs = args.backupDir ? resolvePath(process.cwd(), args.backupDir) : "";

  const samples: ChangeSample[] = [];
  const sampleLimit = 3;
  const stats = {
    markdownFilesPlanned: 0,
    markdownFilesChanged: 0,
    dbRowsPlanned: 0,
    dbRowsChanged: 0,
  };

  // 1) Markdown migration
  if (shouldMigrateMarkdown) {
    if (!localBase) {
      throw new Error("LOCAL_CONTENT_BASE_PATH is required for markdown migration.");
    }
    const rootAbs = resolvePath(process.cwd(), localBase);
    const files = await walkMarkdownFiles(rootAbs);
    for (const relPath of files) {
      const absPath = join(rootAbs, relPath);
      const content = await readFile(absPath, "utf8");
      if (!content.includes("/api/files/")) continue;

      stats.markdownFilesPlanned++;
      const { content: next, changed } = rewriteApiFilesUrlsToRelative(content, relPath);
      if (!changed || next === content) continue;

      stats.markdownFilesChanged++;

      if (samples.length < sampleLimit) {
        const before = firstMatch(content) ?? "/api/files/<unknown>";
        const after = firstMatch(next) ?? "(no /api/files/)";
        samples.push({ kind: "markdown", target: relPath, before, after });
      }

      if (args.apply) {
        await backupFile({ backupDirAbs, relPath, srcAbs: absPath });
        await writeFile(absPath, next, "utf8");
      }
    }
  }

  // 2) DB migration
  if (shouldMigrateDb) {
    const dbPath = process.env.DB_PATH?.trim();
    if (!dbPath) {
      throw new Error("DB_PATH is required when --include-db is enabled.");
    }

    if (args.apply) {
      await backupDbFile({ backupDirAbs, dbPath });
    }

    const sqlite = openDb(dbPath, !args.apply);
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

      if (args.apply) {
        sqlite.exec("BEGIN");
      }

      for (const row of rows) {
        stats.dbRowsPlanned++;

        const markdownFilePath = (row.filePath && row.filePath.length > 0 ? row.filePath : row.id)
          .toString()
          .trim();

        let changed = false;
        let bodyNext = row.body ?? null;
        let metadataNext = row.metadata ?? null;
        let imageNext = row.image ?? null;

        if (typeof row.body === "string" && row.body.includes("/api/files/")) {
          const rewritten = rewriteApiFilesUrlsToRelative(row.body, markdownFilePath).content;
          if (rewritten !== row.body) {
            bodyNext = rewritten;
            changed = true;
          }
        }

        if (typeof row.image === "string" && row.image.includes("/api/files/")) {
          try {
            const normalized = normalizePersistedLink(row.image, markdownFilePath);
            if (normalized !== row.image) {
              imageNext = normalized;
              changed = true;
            }
          } catch {
            // keep original when normalization fails
          }
        }

        if (typeof row.metadata === "string" && row.metadata.includes("/api/files/")) {
          try {
            const parsed = JSON.parse(row.metadata);
            const { normalized, didChange } = normalizeMetadataAttachments(
              parsed,
              markdownFilePath
            );
            const stringified = JSON.stringify(normalized);
            const rewritten = rewriteApiFilesUrlsToRelative(stringified, markdownFilePath).content;
            if (rewritten !== row.metadata || didChange) {
              metadataNext = rewritten;
              changed = true;
            }
          } catch {
            const rewritten = rewriteApiFilesUrlsToRelative(row.metadata, markdownFilePath).content;
            if (rewritten !== row.metadata) {
              metadataNext = rewritten;
              changed = true;
            }
          }
        }

        if (!changed) continue;

        stats.dbRowsChanged++;
        if (samples.length < sampleLimit) {
          const before =
            firstMatch(row.body ?? "") ??
            firstMatch(row.metadata ?? "") ??
            firstMatch(row.image ?? "") ??
            "/api/files/<unknown>";
          const after =
            firstMatch(bodyNext ?? "") ??
            firstMatch(metadataNext ?? "") ??
            firstMatch(imageNext ?? "") ??
            "(no /api/files/)";
          samples.push({ kind: "db", target: `posts:${row.id}`, before, after });
        }

        if (args.apply) {
          sqlite
            .query("UPDATE posts SET body = ?, metadata = ?, image = ? WHERE id = ?")
            .run(bodyNext, metadataNext, imageNext, row.id);
        }
      }

      if (args.apply) {
        sqlite.exec("COMMIT");
      }
    } catch (error) {
      if (args.apply) {
        try {
          sqlite.exec("ROLLBACK");
        } catch {
          // ignore
        }
      }
      throw error;
    } finally {
      sqlite.close();
    }
  }

  // 3) Output summary
  const mode = args.apply ? "apply" : "dry-run";
  console.log(`content:migrate-api-links (${mode})`);
  console.log(`- include-db: ${args.includeDb}`);
  console.log(`- LOCAL_CONTENT_BASE_PATH: ${localBase ?? "(not set)"}`);
  console.log(`- DB_PATH: ${args.includeDb ? (process.env.DB_PATH ?? "(not set)") : "(skipped)"}`);
  if (args.apply) {
    console.log(`- backup-dir: ${backupDirAbs}`);
  }
  console.log("");
  console.log("Planned changes:");
  console.log(
    `- markdown: planned=${stats.markdownFilesPlanned} changed=${stats.markdownFilesChanged}`
  );
  console.log(`- db: planned=${stats.dbRowsPlanned} changed=${stats.dbRowsChanged}`);

  if (samples.length > 0) {
    console.log("\nSamples:");
    for (const s of samples) {
      console.log(`- [${s.kind}] ${s.target}`);
      console.log(`  before: ${s.before}`);
      console.log(`  after:  ${s.after}`);
    }
  }
}

main().catch((err) => {
  const code = err && typeof err === "object" && "exitCode" in err ? (err as any).exitCode : 1;
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(code);
});
