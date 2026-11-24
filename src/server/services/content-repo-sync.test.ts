import { describe, expect, test } from "bun:test";
import type { CanonicalDocument } from "@/lib/content-repo/canonical";
import { ContentRepoError, type ContentRepoTransport } from "@/lib/content-repo/github";
import type { ContentRepoBaseline, ContentRepoEntry, PushItem } from "@/lib/content-repo/push";
import { buildBaselineRow, pushEntriesToRepo } from "./content-repo-sync";

const encoder = new TextEncoder();

function document(path: string, content: string): CanonicalDocument {
  return {
    path,
    bytes: encoder.encode(content),
    contentHash: `hash:${content}`,
    kind: "post",
    media: [],
  };
}

function transportWith(options: { remote?: Map<string, string>; failFirstRef?: boolean } = {}) {
  const calls: string[] = [];
  let heads = 0;
  let blobs = 0;
  let refAttempts = 0;
  const transport: ContentRepoTransport = {
    async resolveHead() {
      heads += 1;
      return { commit: `commit-${heads}`, tree: `tree-${heads}` };
    },
    async listTree(tree) {
      calls.push(`tree-read:${tree}`);
      return options.remote ?? new Map();
    },
    async readBlob(_sha) {
      return encoder.encode("remote");
    },
    async createBlob(bytes) {
      blobs += 1;
      calls.push(`blob:${bytes.byteLength}`);
      return `blob-${blobs}`;
    },
    async createTree(_baseTree, entries) {
      calls.push(`tree:${entries.map((entry) => entry.path).join(",")}`);
      return "new-tree";
    },
    async createCommit(input) {
      calls.push(`commit:${input.parents.join(",")}`);
      return "new-commit";
    },
    async updateRef(commit) {
      refAttempts += 1;
      if (options.failFirstRef && refAttempts === 1)
        throw new ContentRepoError("conflict", "ref moved");
      calls.push(`ref:${commit}`);
      return commit;
    },
  };
  return { calls, transport };
}

describe("content repository push execution", () => {
  test("does not create a commit when nothing changed", async () => {
    const { calls, transport } = transportWith();
    const baselines = new Map<string, ContentRepoBaseline>([
      ["blog/a.md", { contentHash: "hash:a", repoPath: "blog/a.md", media: {}, remoteBlobs: {} }],
    ]);
    const result = await pushEntriesToRepo(
      transport,
      [{ contentId: "post-a", document: document("blog/a.md", "a"), media: [] }],
      baselines
    );
    expect(result.commit).toBeNull();
    expect(result.plan.writes).toEqual([]);
    expect(calls.some((call) => call.startsWith("commit:"))).toBe(false);
  });

  test("retries once when the branch ref moves during the push", async () => {
    const { calls, transport } = transportWith({ failFirstRef: true });
    const result = await pushEntriesToRepo(
      transport,
      [{ contentId: "post-a", document: document("blog/a.md", "a"), media: [] }],
      new Map()
    );
    expect(result.commit).toBe("new-commit");
    expect(calls.filter((call) => call.startsWith("tree-read:")).length).toBe(2);
    expect(result.writtenShas.get("blog/a.md")).toMatch(/^blob-\d+$/u);
  });

  test("claims existing repository paths instead of overwriting them", async () => {
    const { transport } = transportWith({ remote: new Map([["blog/a.md", "remote-sha"]]) });
    const result = await pushEntriesToRepo(
      transport,
      [{ contentId: "post-a", document: document("blog/a.md", "a"), media: [] }],
      new Map()
    );
    expect(result.commit).toBeNull();
    expect(result.plan.items[0]?.status).toBe("claim-required");
  });
});

describe("content repository baselines", () => {
  const entry: ContentRepoEntry = {
    contentId: "post-1",
    document: document("blog/a.md", "a"),
    media: [{ path: "blog/assets/a.png", bytes: encoder.encode("a"), sha256: "sha-a" }],
  };

  test("records the content identity, attachment shas and commit", () => {
    const item: PushItem = {
      path: "blog/a.md",
      kind: "post",
      status: "write",
      contentHash: "hash:a",
      media: [{ path: "blog/assets/a.png", sha256: "sha-a", changed: true }],
    };
    const row = buildBaselineRow(
      item,
      entry,
      new Map([
        ["blog/a.md", "doc-sha"],
        ["blog/assets/a.png", "media-sha"],
      ]),
      undefined,
      "commit-1",
      42
    );
    expect(row).toMatchObject({
      path: "blog/a.md",
      contentId: "post-1",
      kind: "post",
      contentHash: "hash:a",
      commitSha: "commit-1",
      updatedAt: 42,
    });
    expect(JSON.parse(row?.media ?? "{}")).toEqual({
      "blog/assets/a.png": { sha256: "sha-a", remoteSha: "media-sha" },
    });
    expect(JSON.parse(row?.remoteBlobs ?? "{}")).toEqual({
      "blog/a.md": "doc-sha",
      "blog/assets/a.png": "media-sha",
    });
  });

  test("reuses the recorded attachment sha when it was not uploaded again", () => {
    const item: PushItem = {
      path: "blog/a.md",
      kind: "post",
      status: "write",
      contentHash: "hash:b",
      media: [{ path: "blog/assets/a.png", sha256: "sha-a", changed: false }],
    };
    const previous: ContentRepoBaseline = {
      contentHash: "hash:a",
      repoPath: "blog/a.md",
      media: { "blog/assets/a.png": { sha256: "sha-a", remoteSha: "old-media-sha" } },
      remoteBlobs: {},
    };
    const row = buildBaselineRow(
      item,
      entry,
      new Map([["blog/a.md", "doc-sha"]]),
      previous,
      "commit-2",
      43
    );
    expect(JSON.parse(row?.remoteBlobs ?? "{}")["blog/assets/a.png"]).toBe("old-media-sha");
  });

  test("ignores items that were not written", () => {
    const row = buildBaselineRow(
      { path: "blog/a.md", kind: "post", status: "unchanged", contentHash: "hash:a", media: [] },
      entry,
      new Map([["blog/a.md", "doc-sha"]]),
      undefined,
      "commit-3",
      44
    );
    expect(row).toBeNull();
  });
});

describe("content repository retry safety", () => {
  test("reuses uploaded blobs when the ref moved during the push", async () => {
    const { calls, transport } = transportWith({ failFirstRef: true });
    const result = await pushEntriesToRepo(
      transport,
      [{ contentId: "post-a", document: document("blog/a.md", "a"), media: [] }],
      new Map()
    );
    // A ref conflict must not re-upload the same document bytes.
    expect(calls.filter((call) => call.startsWith("blob:"))).toHaveLength(1);
    expect(result.commit).toBe("new-commit");
  });

  test("stops before uploading when the signal is already aborted", async () => {
    const { transport } = transportWith();
    const controller = new AbortController();
    controller.abort();
    await expect(
      pushEntriesToRepo(
        transport,
        [{ contentId: "post-a", document: document("blog/a.md", "a"), media: [] }],
        new Map(),
        { signal: controller.signal }
      )
    ).rejects.toThrow();
  });
});
