import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublicMediaItem } from "@/lib/public-media";
import { __resetSnapshotForTests, getSnapshot } from "../../site/lib/public-site";

let temporaryRoot: string | undefined;
const previousSnapshotPath = process.env.PUBLIC_SNAPSHOT_PATH;
const previousConsoleRuntime = process.env.CONSOLE_RUNTIME;

afterEach(async () => {
  __resetSnapshotForTests();
  if (previousSnapshotPath === undefined) delete process.env.PUBLIC_SNAPSHOT_PATH;
  else process.env.PUBLIC_SNAPSHOT_PATH = previousSnapshotPath;
  if (previousConsoleRuntime === undefined) delete process.env.CONSOLE_RUNTIME;
  else process.env.CONSOLE_RUNTIME = previousConsoleRuntime;
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

function mediaItem(name: string): PublicMediaItem {
  return {
    hash: name,
    kind: "image",
    role: "content",
    alt: null,
    sourcePath: `posts/${name}.png`,
    variants: { content: `/api/public/assets/post/${name}/content.webp` },
    poster: null,
    playback: null,
    sources: [
      {
        variant: "content",
        format: "webp",
        mimeType: "image/webp",
        url: `/api/public/assets/post/${name}/content.webp`,
      },
    ],
  };
}

describe("static public site snapshot media", () => {
  test("omits unused source descriptors while preserving rendered variants", async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "public-site-snapshot-"));
    const snapshotPath = join(temporaryRoot, "snapshot.json");
    const postMedia = mediaItem("post-image");
    const postContentMedia = mediaItem("post-content-image");
    const postAttachmentMedia = mediaItem("post-attachment-image");
    const memoMedia = mediaItem("memo-image");
    const timelineMedia = mediaItem("timeline-image");

    await writeFile(
      snapshotPath,
      JSON.stringify({
        posts: [
          {
            id: "post-id",
            slug: "post",
            title: "Post",
            body: "",
            tags: ["engineering"],
            publishDate: "2026-10-01T00:00:00.000Z",
            filePath: "posts/post.md",
            media: {
              primary: postMedia,
              cover: null,
              content: [postContentMedia],
              attachments: [postAttachmentMedia],
            },
          },
        ],
        memos: [
          {
            id: "memo-id",
            slug: "memo",
            title: "Memo",
            content: "",
            tags: [],
            inlineTags: [],
            isPublic: true,
            createdAt: "2026-10-01T00:00:00.000Z",
            filePath: "memos/memo.md",
            media: { primary: memoMedia, cover: null, content: [], attachments: [] },
          },
        ],
        tags: {
          summaries: [],
          groups: [],
          categoryIcons: {},
          tagIconMap: {},
          tagIconSvgMap: {},
          timelines: {
            engineering: [
              {
                type: "post",
                slug: "post",
                filePath: "posts/post.md",
                content: null,
                media: {
                  primary: timelineMedia,
                  cover: null,
                  content: [],
                  attachments: [],
                },
              },
            ],
          },
        },
      })
    );
    process.env.PUBLIC_SNAPSHOT_PATH = snapshotPath;
    delete process.env.CONSOLE_RUNTIME;

    const snapshot = await getSnapshot();
    const items = [
      snapshot.posts[0]?.media.primary,
      ...(snapshot.posts[0]?.media.content ?? []),
      ...(snapshot.posts[0]?.media.attachments ?? []),
      snapshot.memos[0]?.media.primary,
      snapshot.tags.timelines.engineering?.[0]?.media.primary,
    ];

    expect(items).toHaveLength(5);
    expect(snapshot.tags.timelines.engineering?.[0]?.media.primary?.hash).toBe("post-image");
    for (const item of items) {
      expect(item?.sources).toEqual([]);
      expect(item?.variants.content).toMatch(/^\/api\/public\/assets\//u);
    }
  });
});
