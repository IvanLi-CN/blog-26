import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { CLIPPING_RESOURCE_MAX_BYTES } from "@/lib/clipping-resources";
import {
  isClippingRowPublic,
  isClippingRowPublicSync,
  withClippingVisibilityLock,
} from "./projection";
import {
  attachClippingReference,
  ClippingStore,
  clippingCreator,
  clippingIdForMemo,
  clippingManifestSchema,
  readClippingResourceBody,
} from "./store";

const prior = {
  content: process.env.LOCAL_CONTENT_BASE_PATH,
  materials: process.env.CLIPPING_CONTENT_BASE_PATH,
};
afterEach(() => {
  for (const [key, value] of Object.entries({
    LOCAL_CONTENT_BASE_PATH: prior.content,
    CLIPPING_CONTENT_BASE_PATH: prior.materials,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "clipping-store-"));
  process.env.LOCAL_CONTENT_BASE_PATH = join(root, "authored");
  process.env.CLIPPING_CONTENT_BASE_PATH = join(root, "materials");
  await mkdir(join(root, "authored", "Memos"), { recursive: true });
  return root;
}
test("creator proof cannot be forged or copied to a different memo; imports remain admin-only", async () => {
  const root = await fixture();
  try {
    const frontmatter: Record<string, unknown> = {};
    await attachClippingReference(
      "https://example.com\n\n#剪藏",
      frontmatter,
      "creator",
      "Memos/one.md"
    );
    expect(await clippingCreator(frontmatter, "Memos/one.md")).toBe("creator");
    expect(await clippingCreator(frontmatter, "Memos/two.md")).toBeNull();
    const reference = frontmatter.clipping as Record<string, unknown>;
    reference.creatorId = "attacker";
    expect(await clippingCreator(frontmatter, "Memos/one.md")).toBeNull();
    expect(
      await clippingCreator(
        { clipping: { id: reference.id, creatorId: "attacker" } },
        "Memos/one.md"
      )
    ).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves the stable imported clipping identity during a later edit", async () => {
  const root = await fixture();
  try {
    const memoId = "Memos/imported.md";
    const stableId = clippingIdForMemo(memoId, {});
    const store = new ClippingStore();
    await store.save(
      clippingManifestSchema.parse({
        schemaVersion: 1,
        id: stableId,
        memoId,
        creatorId: null,
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.com/article",
        conversationId: null,
        previousConversations: [],
        currentVersionId: null,
        activeVersionId: null,
        versions: [],
      })
    );
    const frontmatter: Record<string, unknown> = {};
    await attachClippingReference(
      "https://example.com/article\n\nEdited remarks\n\n#剪藏",
      frontmatter,
      "editor",
      memoId
    );
    expect((frontmatter.clipping as Record<string, unknown>).id).toBe(stableId);
    expect((frontmatter.clipping as Record<string, unknown>).creatorId).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raw visibility fences stale public indices and missing authored files", async () => {
  const root = await fixture();
  try {
    const id = "Memos/one.md";
    const row = {
      id,
      type: "memo",
      body: "https://example.com\n\n#剪藏",
      tags: '["剪藏"]',
      metadata: null,
    };
    const path = join(root, "authored", id);
    await writeFile(path, matter.stringify(row.body, { public: true }));
    expect(await isClippingRowPublic(row)).toBe(true);
    await writeFile(path, matter.stringify(row.body, { public: false }));
    expect(await isClippingRowPublic(row)).toBe(false);
    await writeFile(path, matter.stringify(row.body, { public: true, draft: true }));
    expect(await isClippingRowPublic(row)).toBe(false);
    await rm(path);
    expect(await isClippingRowPublic(row)).toBe(false);
    expect(isClippingRowPublicSync(row)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("serializes clipping visibility checks with administrator file updates", async () => {
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let administratorStarted = false;
  const readerOperation = withClippingVisibilityLock(async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return "reader";
  });
  await enteredPromise;
  const administratorOperation = withClippingVisibilityLock(async () => {
    administratorStarted = true;
    return "administrator";
  });
  await Promise.resolve();
  expect(administratorStarted).toBe(false);
  release();
  await expect(readerOperation).resolves.toBe("reader");
  await expect(administratorOperation).resolves.toBe("administrator");
  expect(administratorStarted).toBe(true);
});
test("private artifact storage rejects public-root placement and path traversal", async () => {
  const root = await fixture();
  try {
    const unsafe = new ClippingStore(join(root, "authored", "artifacts"));
    await expect(unsafe.validateBoundary()).rejects.toThrow("公开内容");
    const store = new ClippingStore();
    await expect(store.read("../outside", "../version", "source")).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("losing ownership while staging an artifact preserves the committed material", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    await store.write(id, version, "summary", "Committed summary.");
    let checks = 0;
    store.beforePublish = () => {
      if (++checks === 2) throw new Error("Owner lease expired");
    };
    await expect(store.write(id, version, "summary", "Stale replacement.")).rejects.toThrow(
      "Owner lease expired"
    );
    expect(await store.read(id, version, "summary")).toBe("Committed summary.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleans failed resources only inside the target version", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const firstVersion = "22222222-2222-4222-8222-222222222222";
    const failedVersion = "33333333-3333-4333-8333-333333333333";
    const body = Buffer.from("same bytes");
    const hash = createHash("sha256").update(body).digest("hex");
    const resourcePath = `assets/${hash}.png`;
    const resource = {
      id: hash,
      originalUrl: "https://cdn.example/image.png",
      finalUrl: "https://cdn.example/image.png",
      path: resourcePath,
      mimeType: "image/png",
      bytes: body.length,
      status: "captured" as const,
      error: null,
    };
    await store.save(
      clippingManifestSchema.parse({
        schemaVersion: 1,
        id,
        memoId: "Memos/one.md",
        creatorId: null,
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.com/article",
        conversationId: null,
        previousConversations: [],
        currentVersionId: failedVersion,
        activeVersionId: failedVersion,
        versions: [
          {
            id: firstVersion,
            revision: 1,
            targetUrl: "https://example.com/article",
            createdAt: 1,
            resources: [resource],
            resourcesCaptured: true,
          },
          {
            id: failedVersion,
            revision: 2,
            targetUrl: "https://example.com/article",
            createdAt: 2,
          },
        ],
      })
    );
    await store.writeResource(id, firstVersion, resourcePath, body);
    await store.writeResource(id, failedVersion, resourcePath, body);
    await store.removeResourceIfUnreferenced(id, failedVersion, resourcePath);
    await expect(
      readFile(join(root, "materials", id, failedVersion, resourcePath))
    ).rejects.toThrow();
    expect(await readFile(join(root, "materials", id, firstVersion, resourcePath))).toEqual(body);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleans unreferenced assets left by a process crash", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    const body = Buffer.from("orphan");
    const hash = createHash("sha256").update(body).digest("hex");
    const path = `assets/${hash}.png`;
    await store.save(
      clippingManifestSchema.parse({
        schemaVersion: 1,
        id,
        memoId: "Memos/one.md",
        creatorId: null,
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.com/article",
        conversationId: null,
        previousConversations: [],
        currentVersionId: version,
        activeVersionId: version,
        versions: [
          { id: version, revision: 1, targetUrl: "https://example.com/article", createdAt: 1 },
        ],
      })
    );
    await store.writeResource(id, version, path, body);
    await access(join(root, "materials", id, version, path));
    await store.cleanupUnreferencedResources(id);
    await expect(access(join(root, "materials", id, version, path))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleans source files left for removed versions", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    await store.save(
      clippingManifestSchema.parse({
        schemaVersion: 1,
        id,
        memoId: "Memos/one.md",
        creatorId: null,
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.com/article",
        conversationId: null,
        previousConversations: [],
        currentVersionId: null,
        activeVersionId: null,
        versions: [],
      })
    );
    await store.write(id, version, "source", "orphan");
    await store.write(id, version, "summary", "orphan summary");
    await store.write(id, version, "translation", "orphan translation");
    await store.write(id, version, 0, "orphan segment");
    await access(join(root, "materials", id, version, "source.md"));
    await store.cleanupUnreferencedResources(id);
    await expect(access(join(root, "materials", id, version, "source.md"))).rejects.toThrow();
    await expect(access(join(root, "materials", id, version, "summary.md"))).rejects.toThrow();
    await expect(access(join(root, "materials", id, version, "translation.md"))).rejects.toThrow();
    await expect(access(join(root, "materials", id, version, "segments/0.md"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleans source files that are not referenced by the committed version hash", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    const committed = "committed source";
    await store.save(
      clippingManifestSchema.parse({
        schemaVersion: 1,
        id,
        memoId: "Memos/one.md",
        creatorId: null,
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.com/article",
        conversationId: null,
        previousConversations: [],
        currentVersionId: version,
        activeVersionId: version,
        versions: [
          {
            id: version,
            revision: 1,
            targetUrl: "https://example.com/article",
            createdAt: 1,
            sourceHash: createHash("sha256").update(committed).digest("hex"),
          },
        ],
      })
    );
    await store.write(id, version, "source", "orphan source");
    await store.cleanupUnreferencedResources(id);
    await expect(access(join(root, "materials", id, version, "source.md"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleans atomic temporary files left in retained versions after a process crash", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    const suffix = "33333333-3333-4333-8333-333333333333";
    const versionPath = join(root, "materials", id, version);
    const temporaryPaths = [
      join(root, "materials", id, `manifest.json.${suffix}.tmp`),
      join(versionPath, `source.md.${suffix}.tmp`),
      join(versionPath, `summary.md.${suffix}.tmp`),
      join(versionPath, "segments", `0.md.${suffix}.tmp`),
    ];
    await store.save(
      clippingManifestSchema.parse({
        schemaVersion: 1,
        id,
        memoId: "Memos/one.md",
        creatorId: null,
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.com/article",
        conversationId: null,
        previousConversations: [],
        currentVersionId: version,
        activeVersionId: version,
        versions: [
          { id: version, revision: 1, targetUrl: "https://example.com/article", createdAt: 1 },
        ],
      })
    );
    await Promise.all(
      temporaryPaths.map(async (path) => {
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, "stale");
      })
    );

    await store.cleanupUnreferencedResources(id);

    for (const path of temporaryPaths) await expect(access(path)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not delete unreferenced resources after ownership is lost", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    const body = Buffer.from("orphan");
    const hash = createHash("sha256").update(body).digest("hex");
    const resourcePath = `assets/${hash}.png`;
    await store.writeResource(id, version, resourcePath, body);
    store.beforePublish = () => {
      throw new Error("ownership lost");
    };
    await expect(store.removeResourceIfUnreferenced(id, version, resourcePath)).rejects.toThrow(
      "ownership lost"
    );
    expect(await readFile(join(root, "materials", id, version, resourcePath))).toEqual(body);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stops cleanup before deleting when ownership is lost", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    const body = Buffer.from("orphan");
    const hash = createHash("sha256").update(body).digest("hex");
    const resourcePath = `assets/${hash}.png`;
    await store.save(
      clippingManifestSchema.parse({
        schemaVersion: 1,
        id,
        memoId: "Memos/one.md",
        creatorId: null,
        revision: 1,
        enabled: true,
        deleted: false,
        targetUrl: "https://example.com/article",
        conversationId: null,
        previousConversations: [],
        currentVersionId: version,
        activeVersionId: version,
        versions: [
          { id: version, revision: 1, targetUrl: "https://example.com/article", createdAt: 1 },
        ],
      })
    );
    await store.writeResource(id, version, resourcePath, body);
    store.beforePublish = () => {
      throw new Error("ownership lost");
    };
    await expect(store.cleanupUnreferencedResources(id)).rejects.toThrow("ownership lost");
    expect(await readFile(join(root, "materials", id, version, resourcePath))).toEqual(body);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects oversized or truncated resource files before hashing", async () => {
  const root = await fixture();
  try {
    const store = new ClippingStore();
    const id = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    const body = Buffer.from("tiny");
    const hash = createHash("sha256").update(body).digest("hex");
    const path = `assets/${hash}.png`;
    await store.writeResource(id, version, path, body);
    expect(
      await store.readResource(id, version, {
        id: hash,
        originalUrl: "https://cdn.example/image.png",
        finalUrl: "https://cdn.example/image.png",
        path,
        mimeType: "image/png",
        bytes: CLIPPING_RESOURCE_MAX_BYTES + 1,
        status: "captured",
        error: null,
      })
    ).toBeNull();
    expect(
      await store.readResource(id, version, {
        id: hash,
        originalUrl: "https://cdn.example/image.png",
        finalUrl: "https://cdn.example/image.png",
        path,
        mimeType: "image/png",
        bytes: body.length - 1,
        status: "captured",
        error: null,
      })
    ).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reads resources across short reads and rejects trailing bytes", async () => {
  const expected = Buffer.from("captured");
  let calls = 0;
  const reader = {
    read: async (buffer: Uint8Array, offset: number, length: number, position: number) => {
      calls++;
      if (position >= expected.length) return { bytesRead: 0, buffer };
      const count = Math.min(calls === 1 ? 2 : expected.length - position, length);
      buffer.set(expected.subarray(position, position + count), offset);
      return { bytesRead: count, buffer };
    },
  };
  expect((await readClippingResourceBody(reader, expected.length))?.toString()).toBe("captured");
  expect(calls).toBe(3);

  const trailingReader = {
    read: async (buffer: Uint8Array, offset: number, length: number, position: number) => {
      if (position >= expected.length) return { bytesRead: 1, buffer };
      const count = Math.min(expected.length - position, length);
      buffer.set(expected.subarray(position, position + count), offset);
      return { bytesRead: count, buffer };
    },
  };
  expect(await readClippingResourceBody(trailingReader, expected.length)).toBeNull();
});
