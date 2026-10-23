import { Database } from "bun:sqlite";

type Row = {
  id: string;
  parent_id: string | null;
  root_id: string | null;
  target_type: string | null;
  target_key: string | null;
  post_slug: string | null;
  revision: number | null;
};

const dbPath = process.env.DB_PATH || "./sqlite.db";
const sqlite = new Database(dbPath);
const errors: Array<{ id: string; reason: string }> = [];
let rows: Row[] = [];
let repaired = 0;
let exitCode = 0;

const stateTable = sqlite
  .query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'comment_migration_state'"
  )
  .get();

if (!stateTable) {
  sqlite.close();
  throw new Error("comment_migration_state is missing; run bun run migrate first");
}

const stateRow = sqlite
  .query<{ id: string }, [string]>(
    "SELECT id FROM comment_migration_state WHERE id = 'reader-comments'"
  )
  .get("reader-comments");
if (!stateRow) {
  sqlite.close();
  throw new Error("reader-comments migration state is missing; recreate the database migration");
}

const updateState = sqlite.query(
  "UPDATE comment_migration_state SET status = ?, scanned = ?, repaired = ?, error_count = ?, updated_at = ?, last_error = ? WHERE id = 'reader-comments'"
);

function recordState(
  status: "running" | "blocked" | "complete",
  errorList: Array<{ id: string; reason: string }> = []
) {
  updateState.run(
    status,
    rows.length,
    repaired,
    errorList.length,
    Date.now(),
    errorList.length ? JSON.stringify(errorList.slice(0, 20)) : null
  );
}

function effectiveTarget(row: Row) {
  return {
    type: row.target_type || "article",
    key: row.target_key?.trim() || row.post_slug?.trim() || "",
  };
}

function findRoot(row: Row, byId: Map<string, Row>) {
  let current = row;
  const seen = new Set<string>();
  while (current.parent_id) {
    if (seen.has(current.id)) {
      errors.push({ id: row.id, reason: "parent-cycle" });
      return null;
    }
    seen.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) {
      errors.push({ id: row.id, reason: `missing-parent:${current.parent_id}` });
      return null;
    }
    const currentTarget = effectiveTarget(current);
    const parentTarget = effectiveTarget(parent);
    if (!currentTarget.key || !parentTarget.key) {
      errors.push({ id: row.id, reason: "missing-target-key" });
      return null;
    }
    if (currentTarget.type !== parentTarget.type || currentTarget.key !== parentTarget.key) {
      errors.push({ id: row.id, reason: `parent-target-mismatch:${parent.id}` });
      return null;
    }
    current = parent;
  }
  return current.id;
}

const update = sqlite.query(
  "UPDATE comments SET target_type = COALESCE(?, 'article'), target_key = COALESCE(NULLIF(?, ''), post_slug), root_id = ?, revision = COALESCE(?, 1) WHERE id = ?"
);

try {
  recordState("running");
  rows = sqlite
    .query<Row, []>(
      "SELECT id, parent_id, root_id, target_type, target_key, post_slug, revision FROM comments ORDER BY created_at, id"
    )
    .all();
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const row of rows) {
    const rootId = findRoot(row, byId);
    if (!rootId) continue;
    const { type: targetType, key: targetKey } = effectiveTarget(row);
    if (!targetKey) {
      errors.push({ id: row.id, reason: "missing-target-key" });
      continue;
    }
    const revision = row.revision || 1;
    if (
      row.root_id !== rootId ||
      row.target_type !== targetType ||
      row.target_key !== targetKey ||
      row.revision !== revision
    ) {
      update.run(targetType, targetKey, rootId, revision, row.id);
      repaired += 1;
    }
  }

  if (errors.length) {
    recordState("blocked", errors);
    exitCode = 1;
  } else {
    recordState("complete");
  }

  console.log(
    JSON.stringify(
      {
        database: dbPath,
        scanned: rows.length,
        repaired,
        errors,
        status: errors.length ? "blocked" : "complete",
      },
      null,
      2
    )
  );
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const failure = [...errors, { id: "__backfill__", reason }];
  recordState("blocked", failure);
  console.error(`Reader comment backfill blocked: ${reason}`);
  exitCode = 1;
} finally {
  sqlite.close();
}

if (exitCode) process.exit(exitCode);
