import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import matter from "gray-matter";
import { db, initializeDB } from "@/lib/db";
import { memoClippings, posts } from "@/lib/schema";
import { buildPublicSnapshot, writePublicSnapshot } from "@/public-site/snapshot";
import type { TRPCContext } from "@/server/context";
import { handleClippingRequest } from "./api";
import { ClippingService } from "./service";
import {
  attachClippingReference,
  ClippingStore,
  clippingManifestSchema,
  clippingVersionSchema,
} from "./store";

let root: string;
let store: ClippingStore;
const id = "Memos/clip.md";
const body = "https://article.example/one\n\n备注\n\n#剪藏";
const fm: Record<string, unknown> = { public: true, tags: ["剪藏"] };
const prior = { ...process.env };
let clippingId: string;
const versionId = randomUUID();
let raw: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "clipping-api-"));
  process.env.DB_PATH = join(root, "app.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = join(root, "authored");
  process.env.CLIPPING_CONTENT_BASE_PATH = join(root, "materials");
  await mkdir(join(root, "authored", "Memos"), { recursive: true });
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
  await attachClippingReference(body, fm, "creator", id);
  clippingId = (fm.clipping as { id: string }).id;
  raw = matter.stringify(body, fm);
  await writeFile(join(root, "authored", id), raw);
  await db.insert(posts).values({
    id,
    slug: "clip",
    type: "memo",
    title: "",
    body,
    filePath: id,
    public: true,
    draft: false,
    publishDate: Date.now(),
    source: "local",
    dataSource: "local",
    tags: '["剪藏"]',
    metadata: JSON.stringify(fm),
    contentHash: createHash("sha256").update(body).digest("hex"),
  });
  store = new ClippingStore();
  await store.save(
    clippingManifestSchema.parse({
      schemaVersion: 1,
      id: clippingId,
      memoId: id,
      creatorId: "creator",
      revision: 1,
      enabled: true,
      targetUrl: "https://article.example/one",
      conversationId: "private-conversation",
      previousConversations: [],
      currentVersionId: versionId,
      activeVersionId: versionId,
      versions: [
        clippingVersionSchema.parse({
          id: versionId,
          revision: 1,
          targetUrl: "https://article.example/one",
          createdAt: Date.now(),
          status: "completed",
          summaryState: "completed",
          translationState: "completed",
          sourceHash: createHash("sha256").update("# Article\n\nSource.").digest("hex"),
          pageTitle: "Article",
        }),
      ],
    })
  );
  for (const [artifact, content] of Object.entries({
    source: "# Article\n\nSource.",
    summary: "摘要。",
    translation: "# 文章\n\n正文。",
  }))
    await store.write(
      clippingId,
      versionId,
      artifact as "source" | "summary" | "translation",
      content
    );
});
afterAll(async () => {
  for (const key of ["DB_PATH", "LOCAL_CONTENT_BASE_PATH", "CLIPPING_CONTENT_BASE_PATH"]) {
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
  }
  await rm(root, { recursive: true, force: true });
});
function context(actor: "admin" | "creator" | "other" | "guest"): TRPCContext {
  return {
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    isAdmin: actor === "admin",
    ...(actor === "guest"
      ? {}
      : { user: { id: actor, nickname: actor, email: `${actor}@example.com` } }),
  };
}
async function request(operation: string, actor: Parameters<typeof context>[0]) {
  return handleClippingRequest(
    new Request(`http://localhost/api/public/memos/clip/clipping/${operation}`),
    "clip",
    operation,
    context(actor)
  );
}
test("public reading exposes only materials; conversation/history is restricted to creator and admin", async () => {
  const reading = await (await request("", "guest")).json();
  expect(reading.source).toContain("Source.");
  expect(reading.content).toBe("备注\n\n---\n\n**Agent 摘要**\n\n摘要。");
  expect(JSON.stringify(reading)).not.toContain("private-conversation");
  expect(JSON.stringify(reading)).not.toContain("creator");
  for (const actor of ["guest", "other"] as const)
    for (const operation of ["history", "chat", "chat/events"])
      await expect(request(operation, actor)).rejects.toMatchObject({
        code: actor === "guest" ? "UNAUTHORIZED" : "FORBIDDEN",
      });
  for (const actor of ["creator", "admin"] as const)
    expect((await request("history", actor)).status).toBe(200);
  expect((await (await request("status", "guest")).json()).source).toBeUndefined();
});
test("public exports omit identities, runtime data, private conversation and stale article artifacts", async () => {
  const output = join(root, "export", "snapshot.json");
  await mkdir(join(root, "export"), { recursive: true });
  const exported = await writePublicSnapshot(output);
  expect(exported.clippingArticles?.clip.source).toContain("Source.");
  expect(JSON.stringify(exported)).not.toContain("private-conversation");
  expect(JSON.stringify(exported)).not.toContain('"proof"');
  expect(await Bun.file(join(root, "export", "clippings", "clip.json")).exists()).toBe(true);
  await writeFile(join(root, "authored", id), matter.stringify(body, { ...fm, public: false }));
  await expect(request("", "guest")).rejects.toMatchObject({ code: "FORBIDDEN" });
  const hidden = await writePublicSnapshot(output);
  expect(hidden.memos).toHaveLength(0);
  expect(hidden.clippingArticles).toEqual({});
  expect(await Bun.file(join(root, "export", "clippings", "clip.json")).exists()).toBe(false);
  await writeFile(join(root, "authored", id), raw);
});
test("canonical files rebuild a deleted index without executing completed materials", async () => {
  await db.delete(memoClippings);
  const service = await ClippingService.open({
    store,
    runtimePath: join(root, "pi.sqlite"),
    memoIds: async () => [id],
    resolveModel: async () => ({ model: null, baseUrl: null, apiKey: null }),
    scanIntervalMs: 60_000,
  });
  try {
    await service.idle();
    expect((await db.select().from(memoClippings))[0]?.creatorId).toBe("creator");
    expect((await buildPublicSnapshot()).clippingArticles?.clip.translation).toContain("正文。");
  } finally {
    await service.close();
  }
});
