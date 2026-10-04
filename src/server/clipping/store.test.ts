import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { isClippingRowPublic } from "./projection";
import { attachClippingReference, ClippingStore, clippingCreator } from "./store";

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
