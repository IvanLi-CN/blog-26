import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { SITE } from "../../src/config/site";
import { createEmptyPublicMediaCollection } from "../../src/lib/public-media";
import type { PublicSnapshot } from "../../src/public-site/snapshot";

/** Old-format, deterministic public bundle: no DB, network, credentials, or production content. */
export function projectTagsFixture(): PublicSnapshot {
  return {
    generatedAt: "2026-10-01T00:00:00.000Z",
    site: SITE,
    stats: { totalPosts: 1, categories: [] },
    relatedPosts: {},
    posts: [
      {
        id: "fixture-post",
        slug: "react-engineering",
        title: "React 工程实践",
        excerpt: "从组件边界到可验证的浏览器行为。",
        body: "# React 工程实践\n\n受控示例文章。",
        publishDate: "2026-09-30T00:00:00.000Z",
        updateDate: null,
        category: null,
        tags: ["React", "Engineering/Architecture"],
        author: "Ivan",
        image: null,
        media: createEmptyPublicMediaCollection(),
        dataSource: null,
        filePath: "fixture-post.md",
        metadata: {},
      },
    ],
    memos: [
      {
        id: "fixture-memo",
        slug: "react-note",
        title: "组件验证随记",
        excerpt: "标签把项目和阅读线索联系起来。",
        content: "标签把项目和阅读线索联系起来。 #React #MemoOnly",
        tags: [],
        inlineTags: [],
        isPublic: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        publishedAt: "2026-10-01T00:00:00.000Z",
        updatedAt: null,
        dataSource: null,
        filePath: "fixture-memo.md",
        image: null,
        media: createEmptyPublicMediaCollection(),
      },
    ],
    tags: {
      summaries: [],
      groups: [],
      categoryIcons: {},
      tagIconMap: {},
      tagIconSvgMap: {},
      timelines: {},
    },
  };
}

if (import.meta.main) {
  const file = resolve(process.argv[2] || ".tmp/project-tags-demo/public-snapshot.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(projectTagsFixture(), null, 2)}\n`);
  console.log(file);
}
