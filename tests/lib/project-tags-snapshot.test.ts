import { describe, expect, it } from "bun:test";
import { buildTagFeed } from "../../site/lib/feeds";
import { projectCatalog } from "../../src/lib/project-catalog";
import { rebuildSnapshotTags } from "../../src/lib/snapshot-tags";
import { projectTagsFixture } from "./project-tags-fixture";

describe("project tags snapshot compatibility", () => {
  it("rebuilds old bundles from records and the current catalog while retaining time and content", () => {
    const raw = projectTagsFixture();
    const snapshot = rebuildSnapshotTags(raw);
    expect(snapshot.generatedAt).toBe(raw.generatedAt);
    expect(snapshot.posts[0].body).toBe(raw.posts[0].body);
    expect(snapshot.memos[0].content).toBe(raw.memos[0].content);
    expect(snapshot.tags.summaries.find((tag) => tag.name === "React")).toMatchObject({
      count: 12,
      postCount: 1,
      memoCount: 1,
      projectCount: 10,
    });
    expect(snapshot.tags.timelines.React.map((item) => item.type)).toEqual(["memo", "post"]);
    expect(snapshot.tags.summaries.find((tag) => tag.name === "Engineering")?.count).toBe(1);
    expect(snapshot.tags.summaries.find((tag) => tag.name === "MemoOnly")?.memoCount).toBe(1);
  });
  it("drops stale project associations and metadata but retains dated uses and native fallback", () => {
    const raw = projectTagsFixture();
    raw.tags.groups = [{ key: "engineering", title: "Engineering", tags: ["React", "Ghost"] }];
    raw.tags.tagIconMap = { React: "tabler:code", Ghost: "tabler:ghost" };
    raw.tags.tagIconSvgMap = {
      "tabler:code": "code",
      "tabler:ghost": "ghost",
      "tabler:hash": "hash",
    };
    const old = rebuildSnapshotTags(raw, [{ ...projectCatalog[0], techTags: ["Ghost", "React"] }]);
    const current = rebuildSnapshotTags(old, [
      { ...projectCatalog[0], techTags: ["NewClassification"] },
    ]);
    expect(current.tags.projectsByTag?.Ghost).toBeUndefined();
    expect(current.tags.projectsByTag?.React).toEqual([]);
    expect(current.tags.projectsByTag?.NewClassification).toEqual(["codex-vibe-monitor"]);
    expect(current.tags.summaries.find((tag) => tag.name === "React")?.count).toBe(2);
    expect(current.tags.groups[0].tags).toEqual(["React"]);
    expect(current.tags.tagIconMap.Ghost).toBeUndefined();
    expect(current.tags.tagIconSvgMap["tabler:ghost"]).toBeUndefined();
    expect(current.tags.tagIconSvgMap["tabler:hash"]).toBe("hash");
  });
  it("keeps project-only RSS a valid empty dated feed", () => {
    const snapshot = rebuildSnapshotTags(projectTagsFixture());
    expect(snapshot.tags.projectsByTag?.Harness?.length).toBeGreaterThan(0);
    expect(snapshot.tags.timelines.Harness).toEqual([]);
    const rss = buildTagFeed(snapshot, "Harness").rss;
    expect(rss).toContain("<rss");
    expect(rss).toContain("<channel>");
    expect(rss).not.toContain("<item>");
  });
});
