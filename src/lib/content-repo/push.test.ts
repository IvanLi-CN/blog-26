import { describe, expect, test } from "bun:test";
import type { CanonicalDocument } from "./canonical";
import {
  buildCommitMessage,
  type ContentRepoBaseline,
  type ContentRepoEntry,
  planPush,
} from "./push";

const encoder = new TextEncoder();

function document(
  path: string,
  content: string,
  kind: "post" | "memo" = "post"
): CanonicalDocument {
  return {
    path,
    bytes: encoder.encode(content),
    contentHash: `hash:${content}`,
    kind,
    media: [],
  };
}

function entry(
  path: string,
  content: string,
  media: ContentRepoEntry["media"] = []
): ContentRepoEntry {
  return { contentId: path, document: document(path, content), media };
}

const maxFileBytes = () => 1024;

describe("content repository push planning", () => {
  test("skips contents whose hash and attachments match the baseline", () => {
    const baselines = new Map<string, ContentRepoBaseline>([
      ["blog/a.md", { contentHash: "hash:a", repoPath: "blog/a.md", media: {}, remoteBlobs: {} }],
    ]);
    const plan = planPush({
      entries: [entry("blog/a.md", "a")],
      remote: new Map([["blog/a.md", "remote-sha"]]),
      baselines,
      maxFileBytes,
    });
    expect(plan.writes).toEqual([]);
    expect(plan.skipped).toBe(1);
    expect(plan.items[0]?.status).toBe("unchanged");
  });

  test("requires an explicit claim when the repository already has the path", () => {
    const plan = planPush({
      entries: [entry("blog/a.md", "a")],
      remote: new Map([["blog/a.md", "remote-sha"]]),
      baselines: new Map(),
      maxFileBytes,
    });
    expect(plan.items[0]?.status).toBe("claim-required");
    expect(plan.writes).toEqual([]);
    expect(plan.conflicts).toBe(1);
  });

  test("writes new contents in stable path order", () => {
    const plan = planPush({
      entries: [entry("blog/z.md", "z"), entry("blog/a.md", "a")],
      remote: new Map(),
      baselines: new Map(),
      maxFileBytes,
    });
    expect(plan.writes.map((write) => write.path)).toEqual(["blog/a.md", "blog/z.md"]);
    expect(plan.counts).toEqual({ post: 2, memo: 0, media: 0 });
  });

  test("uploads only changed attachments", () => {
    const media = [
      { path: "blog/assets/a.png", bytes: encoder.encode("a"), sha256: "sha-a" },
      { path: "blog/assets/b.png", bytes: encoder.encode("b"), sha256: "sha-b" },
    ];
    const baselines = new Map<string, ContentRepoBaseline>([
      [
        "blog/a.md",
        {
          contentHash: "hash:new",
          repoPath: "blog/a.md",
          media: {
            "blog/assets/a.png": { sha256: "sha-a", remoteSha: "remote-a" },
            "blog/assets/b.png": { sha256: "stale", remoteSha: "remote-b" },
          },
          remoteBlobs: {},
        },
      ],
    ]);
    const plan = planPush({
      entries: [{ contentId: "blog/a.md", document: document("blog/a.md", "new"), media }],
      remote: new Map([
        ["blog/a.md", "remote-doc"],
        ["blog/assets/a.png", "remote-a"],
        ["blog/assets/b.png", "remote-b"],
      ]),
      baselines,
      maxFileBytes,
    });
    expect(plan.writes.map((write) => write.path)).toEqual(["blog/a.md", "blog/assets/b.png"]);
    expect(plan.counts.media).toBe(1);
  });

  test("blocks oversized contents instead of truncating", () => {
    const plan = planPush({
      entries: [entry("blog/big.md", "x".repeat(2048))],
      remote: new Map(),
      baselines: new Map(),
      maxFileBytes,
    });
    expect(plan.items[0]?.status).toBe("oversized");
    expect(plan.writes).toEqual([]);
    expect(plan.blocked).toBe(1);
  });

  test("builds a deterministic commit message", () => {
    expect(buildCommitMessage({ post: 2, memo: 1 })).toBe(
      "content: push 2 post(s) and 1 memo(s) from console"
    );
  });
});
