import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, getTableColumns, gt, inArray, sql } from "drizzle-orm";
import { buildSearchSnippet } from "@/lib/ai/search-snippet";
import { db, initializeDB } from "@/lib/db";
import {
  type Post,
  posts,
  searchContentVersions,
  searchIndexState,
  searchOutbox,
} from "@/lib/schema";
import { isClippingSearchMemo } from "@/lib/search/content-search";
import { positiveSearchTerms } from "@/lib/search/highlights";
import { type IndexUpdate, NativeIndex } from "@/lib/search/native-index";
import {
  ContentSearchError,
  NAME_POLICY_VERSION,
  planNativeQuery,
} from "@/lib/search/native-query";
import { isClippingRowPublic } from "@/server/clipping/projection";

const INDEX_VERSION = `tantivy-0.26.2:${NAME_POLICY_VERSION}:schema-v2`;
function versionedRows() {
  return db
    .select({ ...getTableColumns(posts), searchRevision: searchContentVersions.version })
    .from(posts)
    .leftJoin(searchContentVersions, eq(posts.id, searchContentVersions.contentId));
}
export async function readSearchRows(ids: string[]) {
  return versionedRows().where(inArray(posts.id, ids));
}
export type IndexedContent = { row: Post; version: string; score: number };
export function contentVersion(row: Post) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}
export async function authorizeContent(row: Post, publishedOnly: boolean) {
  return (
    (row.type === "post" || row.type === "memo") &&
    (!publishedOnly || (!row.draft && row.public && (await isClippingRowPublic(row))))
  );
}
export function contentResult(
  candidate: IndexedContent,
  query: string,
  searchOrigin?: "keyword" | "ai"
) {
  const row = candidate.row;
  const highlightTerms = positiveSearchTerms(planNativeQuery(query).ast);
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    snippet: buildSearchSnippet(query, row, highlightTerms),
    highlightTerms,
    type: row.type === "post" ? ("post" as const) : ("memo" as const),
    ...(isClippingSearchMemo(row.type, row.tags) ? { isClipping: true } : {}),
    ...(searchOrigin ? { searchOrigin } : {}),
  };
}

class SearchProjection {
  private native?: NativeIndex;
  private generation?: string;
  private chain: Promise<unknown> = Promise.resolve();
  readonly directory: string;
  constructor(readonly databasePath: string) {
    this.directory = path.resolve(process.env.SEARCH_INDEX_PATH ?? `${databasePath}.search`);
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.chain.then(work);
    this.chain = pending.catch(() => undefined);
    return pending;
  }
  async status() {
    try {
      const state = await db
        .select()
        .from(searchIndexState)
        .where(eq(searchIndexState.id, "content"))
        .get();
      const high = await db
        .select({ watermark: sql<number>`COALESCE(MAX(${searchOutbox.seq}),0)` })
        .from(searchOutbox)
        .get();
      let dataPrepared = false;
      if (state && /^generation-[0-9a-f-]{36}$/u.test(state.generation)) {
        try {
          const dir = path.join(this.directory, state.generation);
          const manifest = JSON.parse(await readFile(path.join(dir, "projection.json"), "utf8"));
          await readFile(path.join(dir, "meta.json"), "utf8");
          dataPrepared =
            manifest.version === INDEX_VERSION && manifest.database === this.databasePath;
        } catch {
          /* A request never repairs or rebuilds its projection. */
        }
      }
      const watermark = Number(high?.watermark ?? 0);
      return {
        state,
        structureReady: true,
        dataPrepared,
        watermark,
        lag: Math.max(0, watermark - (state?.checkpoint ?? 0)),
        ready: Boolean(state && state.schemaVersion === INDEX_VERSION && dataPrepared),
      };
    } catch {
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-schema-migration-required");
    }
  }
  private async load() {
    const { state, ready } = await this.status();
    if (!state || !ready || !/^generation-[0-9a-f-]{36}$/u.test(state.generation)) {
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-prepare-required");
    }
    if (this.native && this.generation === state.generation) return this.native;
    const dir = path.join(this.directory, state.generation);
    const manifest = JSON.parse(await readFile(path.join(dir, "projection.json"), "utf8"));
    if (manifest.version !== INDEX_VERSION || manifest.database !== this.databasePath) {
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-version-mismatch");
    }
    this.native = await NativeIndex.open(dir);
    this.generation = state.generation;
    return this.native;
  }
  private async update(row: Post): Promise<IndexUpdate> {
    if (!(await authorizeContent(row, false)))
      return { id: row.id, version: contentVersion(row), deleted: true };
    const text = (s: string | null) => s ?? "";
    return {
      id: row.id,
      version: contentVersion(row),
      slug: text(row.slug),
      title: text(row.title),
      excerpt: text(row.excerpt),
      body: text(row.body),
      tags: text(row.tags),
      type: row.type,
      published: await authorizeContent(row, true),
      publishDate: row.publishDate,
    };
  }
  private async catchUp(target: number) {
    const native = await this.load();
    let { state } = await this.status();
    if (!state) throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-not-ready");
    while (state.checkpoint < target) {
      const events: (typeof searchOutbox.$inferSelect)[] = await db
        .select()
        .from(searchOutbox)
        .where(and(gt(searchOutbox.seq, state.checkpoint), sql`${searchOutbox.seq} <= ${target}`))
        .orderBy(asc(searchOutbox.seq))
        .limit(500);
      if (!events.length)
        throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-outbox-gap");
      const ids = [...new Set(events.map((x) => x.contentId))];
      const rows = await readSearchRows(ids);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const updates = await Promise.all(
        ids.map(async (id) => {
          const row = byId.get(id);
          return row ? this.update(row) : { id, version: "deleted", deleted: true };
        })
      );
      await native.apply(updates);
      const checkpoint: number | undefined = events.at(-1)?.seq;
      if (checkpoint === undefined)
        throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-outbox-gap");
      await db
        .update(searchIndexState)
        .set({ checkpoint })
        .where(eq(searchIndexState.id, "content"));
      state = { ...state, checkpoint };
    }
    return native;
  }
  async synchronize(target?: number) {
    const watermark = target ?? (await this.status()).watermark;
    const pending = this.serial(() => this.catchUp(watermark));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-watermark-timeout")
              ),
            2000
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof ContentSearchError) throw error;
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-unavailable");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  /** Explicit backfill outside request execution; SQLite switches generations atomically. */
  async prepare(force = false) {
    return this.serial(async () => {
      const status = await this.status();
      if (status.ready && !force) {
        await this.catchUp(status.watermark);
        return this.status();
      }
      const generation = `generation-${randomUUID()}`;
      const dir = path.join(this.directory, generation);
      await mkdir(dir, { recursive: true });
      const native = await NativeIndex.open(dir);
      // Historical version backfill is explicit data preparation, never structural migration.
      db.run(sql`INSERT INTO search_content_versions(content_id, version)
        SELECT id, 0 FROM posts WHERE true ON CONFLICT(content_id) DO NOTHING`);
      let after = "";
      while (true) {
        const rows = await versionedRows()
          .where(gt(posts.id, after))
          .orderBy(asc(posts.id))
          .limit(500);
        if (!rows.length) break;
        await native.apply(await Promise.all(rows.map((row) => this.update(row))));
        after = rows.at(-1)?.id ?? after;
      }
      const file = path.join(dir, "projection.json");
      const temp = `${file}.tmp`;
      const handle = await open(temp, "wx", 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ version: INDEX_VERSION, database: this.databasePath })
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, file);
      const directory = await open(dir, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      await db
        .insert(searchIndexState)
        .values({
          id: "content",
          generation,
          checkpoint: status.watermark,
          schemaVersion: INDEX_VERSION,
        })
        .onConflictDoUpdate({
          target: searchIndexState.id,
          set: { generation, checkpoint: status.watermark, schemaVersion: INDEX_VERSION },
        });
      this.native = native;
      this.generation = generation;
      await this.catchUp((await this.status()).watermark);
      return this.status();
    });
  }
  async check() {
    return this.serial(async () => {
      await this.catchUp((await this.status()).watermark);
      const native = await this.load();
      const actual = await native.inventory();
      const indexed = new Map(actual.map((hit) => [hit.id, hit.version]));
      const expected = new Map<string, string>();
      let after = "";
      while (true) {
        const rows = await versionedRows()
          .where(gt(posts.id, after))
          .orderBy(asc(posts.id))
          .limit(500);
        if (!rows.length) break;
        for (const row of rows)
          if (await authorizeContent(row, false)) expected.set(row.id, contentVersion(row));
        after = rows.at(-1)?.id ?? after;
      }
      const missing = [...expected.keys()].filter((id) => !indexed.has(id));
      const stale = [...expected]
        .filter(([id, version]) => indexed.has(id) && indexed.get(id) !== version)
        .map(([id]) => id);
      const extra = [...indexed.keys()].filter((id) => !expected.has(id));
      const duplicates = actual.length - indexed.size;
      return {
        ok: !missing.length && !stale.length && !extra.length && duplicates === 0,
        expected: expected.size,
        indexed: actual.length,
        missing,
        stale,
        extra,
        duplicates,
      };
    });
  }
  async search(
    query: string,
    options: {
      limit: number;
      type?: "all" | "post" | "memo";
      publishedOnly?: boolean;
      aliases?: boolean;
    }
  ): Promise<IndexedContent[]> {
    const plan = planNativeQuery(query, options.aliases !== false);
    if (!plan.ast) return [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const native = await this.synchronize();
      const seen = new Set<string>();
      const result: IndexedContent[] = [];
      let stale = false;
      for (let offset = 0; offset <= 10000 && result.length < options.limit; offset += 100) {
        const hits = await native.search(plan.ast, {
          limit: 100,
          offset,
          type: options.type,
          publishedOnly: options.publishedOnly,
        });
        if (!hits.length) break;
        const rows = await readSearchRows(hits.map((x) => x.id));
        const byId = new Map(rows.map((row) => [row.id, row]));
        for (const hit of hits) {
          const row = byId.get(hit.id);
          if (!row || contentVersion(row) !== hit.version) {
            stale = true;
            break;
          }
          if (!(await authorizeContent(row, options.publishedOnly !== false))) continue;
          const key = `${row.type}:${row.slug}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ row, version: hit.version, score: hit.score });
          }
          if (result.length === options.limit) break;
        }
        if (stale || hits.length < 100) break;
        if (offset === 10000 && result.length < options.limit)
          throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-scan-budget-exceeded");
      }
      if (!stale)
        return result.sort(
          (a, b) =>
            b.score - a.score ||
            b.row.publishDate - a.row.publishDate ||
            a.row.id.localeCompare(b.row.id)
        );
    }
    throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-content-changed");
  }
}
// Console startup and the bundled SSR handler must share the same native writer and queue.
const projectionKey = Symbol.for("blog26.content-search-projections");
const shared = globalThis as typeof globalThis & {
  [projectionKey]?: Map<string, SearchProjection>;
};
shared[projectionKey] ??= new Map<string, SearchProjection>();
const projections = shared[projectionKey];
export async function contentSearchIndex() {
  await initializeDB();
  const file = path.resolve(process.env.DB_PATH ?? "./sqlite.db");
  const directory = path.resolve(process.env.SEARCH_INDEX_PATH ?? `${file}.search`);
  const key = JSON.stringify([file, directory]);
  let projection = projections.get(key);
  if (!projection) {
    projection = new SearchProjection(file);
    projections.set(key, projection);
  }
  return projection;
}
