import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublicSnapshot } from "@/public-site/snapshot";
import { buildSiteFeed } from "../../../site/lib/feeds";
import {
  __resetSnapshotForTests,
  appendPublicAssetVersion,
  getSnapshot,
} from "../../../site/lib/public-site";

const originalSnapshotPath = process.env.PUBLIC_SNAPSHOT_PATH;

function createLegacySnapshot(): PublicSnapshot {
  return {
    generatedAt: "2026-06-15T00:00:00.000Z",
    site: {
      title: "Test Blog",
      subtitle: "Compat",
      description: "Compat snapshot",
      url: "https://example.com",
      author: {
        name: "Tester",
        email: "tester@example.com",
      },
      owner: "Tester",
      social: {},
      images: {
        default: "/default-cover.png",
        favicon: "/favicon.svg",
      },
      comment: {
        provider: "none",
      },
      features: {
        comments: false,
        search: true,
        rss: true,
      },
      navigation: [],
    },
    stats: {
      totalPosts: 1,
      categories: [{ name: "Notes", count: 1 }],
    },
    posts: [
      {
        id: "post-1",
        slug: "legacy-post",
        title: "Legacy Post",
        excerpt: "Legacy excerpt",
        body: "Legacy body",
        publishDate: "2026-06-14T00:00:00.000Z",
        updateDate: null,
        category: "Notes",
        tags: ["Notes"],
        author: "Tester",
        image: "/legacy-cover.jpg",
        dataSource: "local",
        filePath: "Notes/legacy-post.md",
        metadata: {},
      } as PublicSnapshot["posts"][number],
    ],
    memos: [
      {
        id: "memo-1",
        slug: "legacy-memo",
        title: "Legacy Memo",
        excerpt: "Memo excerpt",
        content: "Memo body",
        tags: ["Notes"],
        inlineTags: ["Notes"],
        isPublic: true,
        createdAt: "2026-06-14T01:00:00.000Z",
        publishedAt: "2026-06-14T01:00:00.000Z",
        updatedAt: null,
        dataSource: "local",
        filePath: "Memos/legacy-memo.md",
        image: "/legacy-memo.jpg",
      } as PublicSnapshot["memos"][number],
    ],
    relatedPosts: {
      "legacy-post": [],
    },
    tags: {
      summaries: [
        {
          name: "Notes",
          segments: ["Notes"],
          lastSegment: "Notes",
          count: 2,
        },
      ],
      groups: [],
      categoryIcons: {},
      tagIconMap: {},
      tagIconSvgMap: {},
      timelines: {
        Notes: [
          {
            type: "post",
            slug: "legacy-post",
            title: "Legacy Post",
            excerpt: "Legacy excerpt",
            content: null,
            publishDate: "2026-06-14T00:00:00.000Z",
            tags: ["Notes"],
            image: "/legacy-cover.jpg",
            dataSource: "local",
            filePath: "Notes/legacy-post.md",
          } as PublicSnapshot["tags"]["timelines"][string][number],
          {
            type: "memo",
            slug: "legacy-memo",
            title: "Legacy Memo",
            excerpt: "Memo excerpt",
            content: "Memo body",
            publishDate: "2026-06-14T01:00:00.000Z",
            tags: ["Notes"],
            image: "/legacy-memo.jpg",
            dataSource: "local",
            filePath: "Memos/legacy-memo.md",
          } as PublicSnapshot["tags"]["timelines"][string][number],
        ],
      },
    },
  };
}

afterEach(async () => {
  __resetSnapshotForTests();
  if (originalSnapshotPath === undefined) {
    delete process.env.PUBLIC_SNAPSHOT_PATH;
  } else {
    process.env.PUBLIC_SNAPSHOT_PATH = originalSnapshotPath;
  }
});

describe("public snapshot compatibility", () => {
  it("adds a stable version query only to public asset facade urls", () => {
    const version = "2026-06-18T19:32:50.122Z";

    expect(
      appendPublicAssetVersion("/api/public/assets/post/demo/hash1234/card.webp", version)
    ).toBe("/api/public/assets/post/demo/hash1234/card.webp?v=2026-06-18T19%3A32%3A50.122Z");
    expect(
      appendPublicAssetVersion(
        "https://ivanli.cc/api/public/assets/post/demo/hash1234/cover.webp?fit=contain",
        version
      )
    ).toBe(
      "https://ivanli.cc/api/public/assets/post/demo/hash1234/cover.webp?fit=contain&v=2026-06-18T19%3A32%3A50.122Z"
    );
    expect(appendPublicAssetVersion("/images/demo.webp", version)).toBe("/images/demo.webp");
  });

  it("fills missing media collections from legacy snapshots before feed building", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "blog25-snapshot-compat-"));
    try {
      const snapshotPath = join(tempDir, "legacy-public-snapshot.json");
      await writeFile(snapshotPath, `${JSON.stringify(createLegacySnapshot(), null, 2)}\n`, "utf8");
      process.env.PUBLIC_SNAPSHOT_PATH = snapshotPath;
      __resetSnapshotForTests();

      const snapshot = await getSnapshot();

      expect(snapshot.posts[0]?.media).toEqual({
        primary: null,
        cover: null,
        content: [],
        attachments: [],
      });
      expect(snapshot.memos[0]?.media).toEqual({
        primary: null,
        cover: null,
        content: [],
        attachments: [],
      });
      expect(snapshot.tags.timelines.Notes?.[0]?.media).toEqual({
        primary: null,
        cover: null,
        content: [],
        attachments: [],
      });

      const built = buildSiteFeed(snapshot, "atom");
      expect(built.atom).toContain("Legacy Post");
      expect(built.atom).toContain("/legacy-cover.jpg");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rewrites legacy files-api content when reading a preloaded public snapshot", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "blog25-snapshot-compat-"));
    try {
      const snapshot = createLegacySnapshot();
      snapshot.memos[0] = {
        ...snapshot.memos[0],
        slug: "legacy-webdav-memo",
        content: "![legacy](/api/files/webdav/Memos/assets/inline-legacy.png)",
        filePath: "Memos/legacy-webdav-memo.md",
      } as PublicSnapshot["memos"][number];
      snapshot.tags.timelines.Notes[1] = {
        ...snapshot.tags.timelines.Notes[1],
        slug: "legacy-webdav-memo",
        content: "![legacy](/api/files/webdav/Memos/assets/inline-legacy.png)",
        filePath: "Memos/legacy-webdav-memo.md",
      } as PublicSnapshot["tags"]["timelines"][string][number];

      const snapshotPath = join(tempDir, "legacy-public-snapshot.json");
      await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      process.env.PUBLIC_SNAPSHOT_PATH = snapshotPath;
      __resetSnapshotForTests();

      const loaded = await getSnapshot();

      expect(loaded.memos[0]?.content).toContain("/api/public/assets/memo/legacy-webdav-memo/");
      expect(loaded.memos[0]?.content).not.toContain("/api/files/");
      expect(loaded.tags.timelines.Notes?.[1]?.content).toContain(
        "/api/public/assets/memo/legacy-webdav-memo/"
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
