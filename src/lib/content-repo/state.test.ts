import { describe, expect, test } from "bun:test";
import type { CanonicalDocument } from "./canonical";
import type { ContentRepoBaseline, ContentRepoEntry } from "./push";
import { computeSyncStates, summarizeSyncStates } from "./state";

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

/** Content ids are never repository paths; keep them distinct so a bug shows. */
function entry(
  path: string,
  content: string,
  media: ContentRepoEntry["media"] = []
): ContentRepoEntry {
  return { contentId: `content-${path}`, document: document(path, content), media };
}

function baseline(overrides: Partial<ContentRepoBaseline> = {}): ContentRepoBaseline {
  return {
    contentHash: "hash:a",
    repoPath: "blog/a.md",
    media: {},
    remoteBlobs: { "blog/a.md": "remote-a" },
    ...overrides,
  };
}

function stateOf(input: {
  entries: ContentRepoEntry[];
  baselines: Map<string, ContentRepoBaseline>;
  remote: Map<string, string>;
  missingMedia?: Map<string, string[]>;
}) {
  return computeSyncStates(input)[0]?.state;
}

describe("content sync states", () => {
  test("reports synced when content, media and the remote blob all match", () => {
    expect(
      stateOf({
        entries: [entry("blog/a.md", "a")],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map([["blog/a.md", "remote-a"]]),
      })
    ).toBe("synced");
  });

  test("reports to-push when only the local content changed", () => {
    expect(
      stateOf({
        entries: [entry("blog/a.md", "b")],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map([["blog/a.md", "remote-a"]]),
      })
    ).toBe("to-push");
  });

  test("reports to-pull when only the repository changed", () => {
    expect(
      stateOf({
        entries: [entry("blog/a.md", "a")],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map([["blog/a.md", "remote-b"]]),
      })
    ).toBe("to-pull");
  });

  test("reports merge-conflict when both sides changed", () => {
    expect(
      stateOf({
        entries: [entry("blog/a.md", "b")],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map([["blog/a.md", "remote-b"]]),
      })
    ).toBe("merge-conflict");
  });

  test("treats a changed attachment as a local change", () => {
    expect(
      stateOf({
        entries: [
          entry("blog/a.md", "a", [
            { path: "blog/assets/a.png", bytes: encoder.encode("next"), sha256: "sha-next" },
          ]),
        ],
        baselines: new Map([
          [
            "blog/a.md",
            baseline({
              media: { "blog/assets/a.png": { sha256: "sha-old", remoteSha: "media-a" } },
            }),
          ],
        ]),
        remote: new Map([
          ["blog/a.md", "remote-a"],
          ["blog/assets/a.png", "media-a"],
        ]),
      })
    ).toBe("to-push");
  });

  test("reports remote-new when the repository has an unclaimed path", () => {
    expect(
      stateOf({
        entries: [entry("blog/a.md", "a")],
        baselines: new Map(),
        remote: new Map([["blog/a.md", "remote-a"]]),
      })
    ).toBe("remote-new");
  });

  test("reports remote-deleted when the repository file is gone but nothing changed locally", () => {
    expect(
      stateOf({
        entries: [entry("blog/a.md", "a")],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map(),
      })
    ).toBe("remote-deleted");
  });

  test("reports merge-conflict when a remotely deleted file changed locally", () => {
    expect(
      stateOf({
        entries: [entry("blog/a.md", "b")],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map(),
      })
    ).toBe("merge-conflict");
  });

  test("reports pending deletion after the content disappears locally", () => {
    expect(
      stateOf({
        entries: [],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map([["blog/a.md", "remote-a"]]),
      })
    ).toBe("to-push");
  });

  test("surfaces missing attachments without inventing a local change", () => {
    const items = computeSyncStates({
      entries: [entry("blog/a.md", "a")],
      baselines: new Map([["blog/a.md", baseline()]]),
      remote: new Map([["blog/a.md", "remote-a"]]),
      missingMedia: new Map([["blog/a.md", ["blog/assets/gone.png"]]]),
    });
    expect(items[0]?.state).toBe("synced");
    expect(items[0]?.missingMedia).toEqual(["blog/assets/gone.png"]);
  });

  test("does not report attachments or README as remote content", () => {
    const items = computeSyncStates({
      entries: [],
      baselines: new Map(),
      remote: new Map([
        ["README.md", "readme-sha"],
        ["blog/assets/cover.png", "cover-sha"],
        ["Memos/assets/a.webp", "memo-asset-sha"],
        ["blog/new.md", "new-sha"],
      ]),
    });
    expect(items.map((item) => item.path)).toEqual(["blog/new.md"]);
    expect(items[0]?.state).toBe("remote-new");
  });

  test("counts states across contents", () => {
    const counts = summarizeSyncStates(
      computeSyncStates({
        entries: [entry("blog/a.md", "a"), entry("blog/b.md", "b")],
        baselines: new Map([["blog/a.md", baseline()]]),
        remote: new Map([["blog/a.md", "remote-a"]]),
      })
    );
    expect(counts).toMatchObject({ synced: 1, "to-push": 1, "to-pull": 0 });
  });
});
