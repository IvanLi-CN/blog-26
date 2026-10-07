import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { isClippingRowPublic } from "./projection";
import {
  attachClippingReference,
  ClippingStore,
  clippingCreator,
  clippingIdForMemo,
  clippingManifestSchema,
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
