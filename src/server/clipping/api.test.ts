import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import matter from "gray-matter";
import { db, initializeDB } from "@/lib/db";
import { memoClippings, posts } from "@/lib/schema";
import { buildPublicSnapshot, writePublicSnapshot } from "@/public-site/snapshot";
import type { TRPCContext } from "@/server/context";
import { runWithMcpAuth } from "@/server/mcp-auth-context";
import { memosRouter } from "@/server/routers/memos";
import { handlePublicApiRequest } from "../public-api/router";
import { handleClippingRequest, handleClippingResourceRequest } from "./api";
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
const resourceFilename = `${createHash("sha256").update("captured image").digest("hex")}.png`;
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
  await store.writeResource(
    clippingId,
    versionId,
    `assets/${resourceFilename}`,
    Buffer.from("captured image")
  );
  const stored = await store.manifest(clippingId);
  if (!stored) throw new Error("Fixture manifest is missing");
  const storedVersion = stored.versions.find((version) => version.id === versionId);
  if (!storedVersion) throw new Error("Fixture version is missing");
  storedVersion.resourcesCaptured = true;
  storedVersion.resources = [
    {
      id: createHash("sha256").update("captured image").digest("hex"),
      originalUrl: "https://article.example/image.png",
      finalUrl: "https://cdn.example/image.png",
      path: `assets/${resourceFilename}`,
      mimeType: "image/png",
      bytes: "captured image".length,
      status: "captured",
      error: null,
    },
  ];
  await store.save(stored);
  for (const [artifact, content] of Object.entries({
    source: `# Article\n\nSource.\n\n![Asset](./assets/${resourceFilename})`,
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
    new Request(
      `http://localhost/api/public/memos/clip/clipping/${operation}`,
      operation === "reprocess"
        ? {
            method: "POST",
            headers: { origin: "http://localhost", "content-type": "application/json" },
            body: "{}",
          }
        : undefined
    ),
    "clip",
    operation,
    context(actor)
  );
}

test("reprocess rejects cross-origin cookie mutations", async () => {
  await expect(
    handleClippingRequest(
      new Request("http://localhost/api/public/memos/clip/clipping/reprocess", {
        method: "POST",
        headers: { origin: "https://attacker.example", "content-type": "application/json" },
        body: "{}",
      }),
      "clip",
      "reprocess",
      context("creator")
    )
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("versioned clipping resources enforce ownership and public visibility", async () => {
  const response = await handleClippingResourceRequest(
    new Request(
      `http://localhost/api/public/memos/clip/clipping/assets/${versionId}/${resourceFilename}`
    ),
    "clip",
    versionId,
    resourceFilename,
    context("guest")
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.text()).toBe("captured image");
  expect(
    (
      await handleClippingResourceRequest(
        new Request("http://localhost/api/public/memos/clip/clipping/assets/invalid/not-found.png"),
        "clip",
        versionId,
        "not-found.png",
        context("guest")
      )
    ).status
  ).toBe(404);
  await writeFile(join(root, "authored", id), matter.stringify(body, { ...fm, public: false }));
  try {
    await expect(
      handleClippingResourceRequest(
        new Request(
          `http://localhost/api/public/memos/clip/clipping/assets/${versionId}/${resourceFilename}`
        ),
        "clip",
        versionId,
        resourceFilename,
        context("guest")
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  } finally {
    await writeFile(join(root, "authored", id), raw);
  }
});

test("public API router dispatches captured clipping resources", async () => {
  const response = await handlePublicApiRequest(
    new Request(
      `http://localhost/api/public/memos/clip/clipping/assets/${versionId}/${resourceFilename}`
    ),
    `/memos/clip/clipping/assets/${versionId}/${resourceFilename}`
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(await response.text()).toBe("captured image");
});

test("resource facade resolves safe fallback MIME types for supported extensions", async () => {
  const manifest = await store.manifest(clippingId);
  if (!manifest) throw new Error("Fixture manifest is missing");
  const version = manifest.versions.find((candidate) => candidate.id === versionId);
  const resource = version?.resources[0];
  if (!version || !resource) throw new Error("Fixture resource is missing");
  const original = { path: resource.path, mimeType: resource.mimeType };
  try {
    for (const [extension, contentType] of [
      ["apng", "image/apng"],
      ["mpeg", "video/mpeg"],
    ] as const) {
      resource.path = `assets/${resource.id}.${extension}`;
      resource.mimeType = null;
      await store.writeResource(
        clippingId,
        versionId,
        resource.path,
        Buffer.from("captured image")
      );
      await store.save(manifest);
      const response = await handleClippingResourceRequest(
        new Request(
          `http://localhost/api/public/memos/clip/clipping/assets/${versionId}/${resource.id}.${extension}`
        ),
        "clip",
        versionId,
        `${resource.id}.${extension}`,
        context("guest")
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(contentType);
    }
  } finally {
    resource.path = original.path;
    resource.mimeType = original.mimeType;
    await store.save(manifest);
  }
});

test("resource facade rejects an SVG path when the manifest MIME is missing", async () => {
  const manifest = await store.manifest(clippingId);
  if (!manifest) throw new Error("Fixture manifest is missing");
  const version = manifest.versions.find((candidate) => candidate.id === versionId);
  const resource = version?.resources[0];
  if (!version || !resource) throw new Error("Fixture resource is missing");
  const original = { path: resource.path, mimeType: resource.mimeType };
  const svgFilename = `${resource.id}.svg`;
  resource.path = `assets/${svgFilename}`;
  resource.mimeType = null;
  await store.writeResource(clippingId, versionId, resource.path, Buffer.from("captured image"));
  await store.save(manifest);
  try {
    const response = await handleClippingResourceRequest(
      new Request(
        `http://localhost/api/public/memos/clip/clipping/assets/${versionId}/${svgFilename}`
      ),
      "clip",
      versionId,
      svgFilename,
      context("guest")
    );
    expect(response.status).toBe(404);
  } finally {
    resource.path = original.path;
    resource.mimeType = original.mimeType;
    await store.save(manifest);
  }
});

test("resource facade rejects captured files from an incomplete version", async () => {
  const manifest = await store.manifest(clippingId);
  if (!manifest) throw new Error("Fixture manifest is missing");
  const version = manifest.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error("Fixture version is missing");
  version.resourcesCaptured = false;
  await store.save(manifest);
  try {
    const response = await handleClippingResourceRequest(
      new Request(
        `http://localhost/api/public/memos/clip/clipping/assets/${versionId}/${resourceFilename}`
      ),
      "clip",
      versionId,
      resourceFilename,
      context("guest")
    );
    expect(response.status).toBe(404);
  } finally {
    version.resourcesCaptured = true;
    await store.save(manifest);
  }
});

test("public reading exposes only materials; conversation is restricted to creator and admin and history/restore are absent", async () => {
  const reading = await (await request("", "guest")).json();
  expect(reading.source).toContain("Source.");
  expect(reading.content).toBe("备注\n\n---\n\n**Agent 摘要**\n\n摘要。");
  expect(reading.resourceBaseUrl).toContain("/api/public/memos/clip/clipping/assets/");
  expect(JSON.stringify(reading)).not.toContain("article.example/image.png");
  expect(JSON.stringify(reading)).not.toContain("cdn.example/image.png");
  expect(JSON.stringify(reading)).not.toContain("private-conversation");
  expect(JSON.stringify(reading)).not.toContain("creator");
  for (const actor of ["guest", "other"] as const)
    for (const operation of ["chat", "chat/events"])
      await expect(request(operation, actor)).rejects.toMatchObject({
        code: actor === "guest" ? "UNAUTHORIZED" : "FORBIDDEN",
      });
  for (const actor of ["guest", "creator", "admin"] as const) {
    expect((await request("history", actor)).status).toBe(404);
    expect((await request("restore", actor)).status).toBe(404);
  }
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
  await expect(request("", "guest")).rejects.toMatchObject({ code: "NOT_FOUND" });
  const hidden = await writePublicSnapshot(output);
  expect(hidden.memos).toHaveLength(0);
  expect(hidden.clippingArticles).toEqual({});
  expect(await Bun.file(join(root, "export", "clippings", "clip.json")).exists()).toBe(false);
  await writeFile(join(root, "authored", id), raw);
});
test("legacy resource versions remain readable without a public resource facade", async () => {
  const manifest = await store.manifest(clippingId);
  if (!manifest) throw new Error("Fixture manifest is missing");
  const version = manifest.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error("Fixture version is missing");
  const originalSource = await store.read(clippingId, versionId, "source");
  const originalTranslation = await store.read(clippingId, versionId, "translation");
  const external = "https://cdn.example/image(1).png";
  const referenced = "https://cdn.example/reference.png";
  version.resourcesCaptured = false;
  version.resources = [];
  await store.save(manifest);
  await store.write(
    clippingId,
    versionId,
    "source",
    `${originalSource}\n\n![External](${external})\n\n![Referenced][hero]\n\n[hero]: ${referenced}`
  );
  await store.write(
    clippingId,
    versionId,
    "translation",
    `${originalTranslation}\n\n![Translated external](${external})`
  );
  try {
    const reading = await (await request("", "guest")).json();
    expect(reading.source).not.toContain("./assets/");
    expect(reading.source).toContain("External");
    expect(reading.source).not.toContain(external);
    expect(reading.source).not.toContain(referenced);
    expect(reading.translation).toContain("Translated external");
    expect(reading.translation).not.toContain(external);
    expect(reading.resourceBaseUrl).toBeNull();
    expect(reading.reading.warning).toContain("外链");
    const exported = await writePublicSnapshot(join(root, "export", "legacy.json"));
    const article = exported.clippingArticles?.clip;
    expect(article?.source).toContain("Asset");
    expect(article?.source).not.toContain("./assets/");
  } finally {
    version.resourcesCaptured = true;
    version.resources = [
      {
        id: createHash("sha256").update("captured image").digest("hex"),
        originalUrl: "https://article.example/image.png",
        finalUrl: "https://cdn.example/image.png",
        path: `assets/${resourceFilename}`,
        mimeType: "image/png",
        bytes: "captured image".length,
        status: "captured",
        error: null,
      },
    ];
    await store.save(manifest);
    if (originalSource !== null) await store.write(clippingId, versionId, "source", originalSource);
    if (originalTranslation !== null)
      await store.write(clippingId, versionId, "translation", originalTranslation);
  }
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

test("conversation selectors cannot expose an earlier target discussion", async () => {
  for (const actor of ["creator", "admin"] as const) {
    await expect(
      handleClippingRequest(
        new Request(
          "http://localhost/api/public/memos/clip/clipping/chat?conversationId=old-target"
        ),
        "clip",
        "chat",
        context(actor)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
});

test("memo detail rejects stale public clipping rows after private tag removal", async () => {
  try {
    await writeFile(
      join(root, "authored", id),
      matter.stringify("Private author remarks.", { ...fm, public: false, tags: [] })
    );
    await expect(
      memosRouter.createCaller(context("guest")).bySlug({ slug: "clip" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      memosRouter.createCaller(context("other")).bySlug({ slug: "clip" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  } finally {
    await writeFile(join(root, "authored", id), raw);
  }
});

test("MCP omitted tags preserve clipping metadata while explicit empty tags remove the marker", async () => {
  const { createMcpWebTransport } = await import("@/server/mcp");
  const connected = await createMcpWebTransport();
  let actor: { isAdmin: boolean; userId?: string } = { isAdmin: true, userId: "creator" };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => runWithMcpAuth(actor, () => connected.transport.handleRequest(request)),
  });
  const client = new Client({ name: "clipping-regression", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp`))
    );
    await writeFile(
      join(root, "authored", id),
      matter.stringify("Ordinary author remarks.", { public: true, tags: ["保留"] })
    );
    const converted = await client.callTool({
      name: "memos_update",
      arguments: {
        slug: "clip",
        content: "https://article.example/one\n\nConverted remarks.",
        isPublic: true,
        tags: ["剪藏"],
      },
    });
    expect(converted.isError).not.toBe(true);
    const convertedMemo = matter(await Bun.file(join(root, "authored", id)).text());
    expect(convertedMemo.data.clipping?.creatorId).toBe("creator");
    await writeFile(join(root, "authored", id), raw);
    const content = "https://article.example/one\n\nUpdated remarks.";
    const result = await client.callTool({
      name: "memos_update",
      arguments: { slug: "clip", content, isPublic: true },
    });
    expect(result.isError).not.toBe(true);
    const updated = matter(await Bun.file(join(root, "authored", id)).text());
    expect(updated.data.tags).toEqual(fm.tags);
    expect(updated.data.clipping).toEqual(fm.clipping);
    const cleared = await client.callTool({
      name: "memos_update",
      arguments: { slug: "clip", content, isPublic: true, tags: [] },
    });
    expect(cleared.isError).not.toBe(true);
    expect(matter(await Bun.file(join(root, "authored", id)).text()).data.tags).toEqual([]);
    actor = { isAdmin: false };
    const publicList = await client.callTool({
      name: "memos_list",
      arguments: { publicOnly: true, limit: 10 },
    });
    const listed = JSON.parse(String(publicList.content?.[0]?.text)) as {
      items: Array<{ id: string; metadata?: string | null }>;
    };
    const clearedMemo = listed.items.find((item) => item.id === id);
    expect(clearedMemo).toBeTruthy();
    expect(clearedMemo?.metadata).not.toContain("creator");
    expect(clearedMemo?.metadata).not.toContain("proof");
    expect(clearedMemo?.metadata).not.toContain('"clipping"');
    expect(clearedMemo?.metadata).not.toContain("authorEmail");
    expect(clearedMemo?.metadata).not.toContain('"content"');
    expect(clearedMemo).not.toHaveProperty("author");
    expect(clearedMemo).not.toHaveProperty("filePath");
    expect(clearedMemo).not.toHaveProperty("source");
    expect(clearedMemo).not.toHaveProperty("dataSource");
    expect(clearedMemo).not.toHaveProperty("contentHash");
    expect(clearedMemo).not.toHaveProperty("createdVia");
  } finally {
    await client.close();
    await connected.server.close();
    server.stop(true);
    await writeFile(join(root, "authored", id), raw);
  }
});

test("public MCP memo metadata fails closed for private and malformed values", async () => {
  const { createMcpWebTransport } = await import("@/server/mcp");
  const connected = await createMcpWebTransport();
  const actor = { isAdmin: false };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => runWithMcpAuth(actor, () => connected.transport.handleRequest(request)),
  });
  const client = new Client({ name: "mcp-public-metadata", version: "1" });
  const marker = `public-mcp-metadata-${randomUUID()}`;
  const filePath = `Memos/${marker}.md`;
  const fullPath = join(root, "authored", filePath);
  const now = Date.now();
  try {
    await mkdir(join(root, "authored", "Memos"), { recursive: true });
    await writeFile(fullPath, matter.stringify(marker, { public: true, tags: [] }));
    await db.insert(posts).values({
      id: filePath,
      slug: marker,
      type: "memo",
      title: marker,
      body: marker,
      filePath,
      public: true,
      draft: false,
      publishDate: now,
      source: "local",
      dataSource: "local",
      tags: "[]",
      author: "private@example.com",
      metadata: JSON.stringify({
        authorEmail: "private@example.com",
        content: "private body",
        systemShare: { leaseToken: "secret-lease-token" },
        attachments: [
          {
            path: "assets/system-share/submission/secret-lease-token/private.png",
          },
          {
            path: "assets/system-share/submission/secret-lease-token/private.txt",
          },
        ],
      }),
      contentHash: marker,
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp`))
    );

    const list = async () => {
      const result = await client.callTool({
        name: "memos_list",
        arguments: { publicOnly: true, limit: 10, search: marker },
      });
      const payload = JSON.parse(String(result.content?.[0]?.text)) as {
        items: Array<{ id: string; metadata?: string | null }>;
      };
      return payload.items.find((item) => item.id === filePath);
    };

    const sanitized = await list();
    const sanitizedMetadata = JSON.parse(sanitized?.metadata ?? "{}") as {
      attachments?: Array<{ path?: string }>;
    };
    expect(sanitizedMetadata.attachments).toHaveLength(1);
    expect(sanitizedMetadata.attachments?.[0]?.path).toContain("/api/public/assets/memo/");
    expect(sanitized?.metadata).not.toContain("secret-lease-token");

    await db
      .update(posts)
      .set({ metadata: '{"authorEmail":"private@example.com"' })
      .where(eq(posts.id, filePath));
    const malformed = await list();
    expect(malformed?.metadata).toBe("{}");
  } finally {
    await client.close();
    await connected.server.close();
    server.stop(true);
    await db.delete(posts).where(eq(posts.id, filePath));
    await rm(fullPath, { force: true });
  }
});

test("private operations reject a removed canonical marker before stale runtime state", async () => {
  try {
    await writeFile(
      join(root, "authored", id),
      matter.stringify("https://article.example/one", { ...fm, tags: [] })
    );
    for (const operation of ["chat", "chat/events", "reprocess"])
      for (const actor of ["creator", "admin"] as const)
        await expect(request(operation, actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  } finally {
    await writeFile(join(root, "authored", id), raw);
  }
});

test("a snapshot loaded across a target change cannot be returned as the current conversation", async () => {
  const service = await ClippingService.open({
    store,
    runtimePath: join(root, "api-race.sqlite"),
    memoIds: async () => [id],
    resolveModel: async () => ({ model: null, baseUrl: null, apiKey: null }),
    scanIntervalMs: 60_000,
  });
  const key = Symbol.for("blog26.clipping.runtime");
  const globals = globalThis as typeof globalThis & { [key]: { service: ClippingService | null } };
  const previous = globals[key].service;
  const original = service.chatSnapshot;
  let entered!: () => void;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  service.chatSnapshot = async () => {
    entered();
    await gate;
    return { messages: [], generating: false, partial: "" };
  };
  globals[key].service = service;
  try {
    const pending = request("chat", "creator");
    const result = pending.then(
      () => ({ code: "unexpected-success" }),
      (error) => error
    );
    await blocked;
    await writeFile(join(root, "authored", id), matter.stringify(body.replace("/one", "/two"), fm));
    release();
    expect(await result).toMatchObject({ code: "CONFLICT" });
    await expect(request("chat", "admin")).rejects.toMatchObject({ code: "CONFLICT" });
  } finally {
    release();
    globals[key].service = previous;
    service.chatSnapshot = original;
    await writeFile(join(root, "authored", id), raw);
    await service.close();
  }
});
