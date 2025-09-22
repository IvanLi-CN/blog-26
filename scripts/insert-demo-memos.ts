#!/usr/bin/env bun
<<<<<<< HEAD
=======
import { eq } from "drizzle-orm";
>>>>>>> 71b001f (feat(memos): preserve attachments and required paths for non-admin views)
import { db, initializeDB } from "../src/lib/db";
import { posts } from "../src/lib/schema";

function toSec(ts: number) {
  return Math.floor(ts / 1000);
}
<<<<<<< HEAD

async function main() {
  await initializeDB(true);
  const now = Date.now();

=======
async function main() {
  await initializeDB(true);
  const now = Date.now();
>>>>>>> 71b001f (feat(memos): preserve attachments and required paths for non-admin views)
  const memos = [
    {
      id: `memos/demo-a-${now - 60000}.md`,
      type: "memo" as const,
      slug: `demo-a-${Math.random().toString(36).slice(2, 8)}`,
      title: "Demo A",
      excerpt: "A memo with image attachment",
      body: "# Demo A\n有图的 memo。",
      publishDate: toSec(now - 60000),
      updateDate: toSec(now - 60000),
      draft: false,
      public: true,
      category: null,
      tags: JSON.stringify(["test", "public"]),
      author: "demo@local",
      image: null,
      metadata: JSON.stringify({
        attachments: [
          {
            filename: "memo-attachment-1.jpg",
            path: "/memos/assets/memo-attachment-1.jpg",
            isImage: true,
            contentType: "image/jpeg",
          },
        ],
      }),
      dataSource: "webdav",
      contentHash: `hash-${now - 60000}`,
      lastModified: toSec(now - 60000),
      source: "webdav",
      filePath: `memos/demo-a-${now - 60000}.md`,
    },
    {
      id: `memos/demo-b-${now - 30000}.md`,
      type: "memo" as const,
      slug: `demo-b-${Math.random().toString(36).slice(2, 8)}`,
      title: "Demo B",
      excerpt: "B memo (private)",
      body: "# Demo B\n私有 memo。",
      publishDate: toSec(now - 30000),
      updateDate: toSec(now - 30000),
      draft: false,
      public: false,
      category: null,
      tags: JSON.stringify(["test", "private"]),
      author: "demo@local",
      image: null,
      metadata: JSON.stringify({ attachments: [] }),
      dataSource: "webdav",
      contentHash: `hash-${now - 30000}`,
      lastModified: toSec(now - 30000),
      source: "webdav",
      filePath: `memos/demo-b-${now - 30000}.md`,
    },
    {
      id: `memos/demo-c-${now - 10000}.md`,
      type: "memo" as const,
      slug: `demo-c-${Math.random().toString(36).slice(2, 8)}`,
      title: "Demo C",
      excerpt: "C memo latest by publish time",
      body: "# Demo C\n最新的公开 memo。",
      publishDate: toSec(now - 10000),
      updateDate: toSec(now - 10000),
      draft: false,
      public: true,
      category: null,
      tags: JSON.stringify(["test", "public"]),
      author: "demo@local",
      image: null,
      metadata: JSON.stringify({ attachments: [] }),
      dataSource: "webdav",
      contentHash: `hash-${now - 10000}`,
      lastModified: toSec(now - 10000),
      source: "webdav",
      filePath: `memos/demo-c-${now - 10000}.md`,
    },
  ];
<<<<<<< HEAD

  // 删除可能同名的旧数据（幂等）
  for (const m of memos) {
    await db.delete(posts).where(posts.id.eq(m.id));
  }

  await db.insert(posts).values(memos as any);
  console.log(
    "✅ Inserted demo memos:",
    memos.map((m) => ({ slug: m.slug, publishDate: m.publishDate }))
  );
}

=======
  for (const m of memos) {
    await db.delete(posts).where(eq(posts.id, m.id));
  }
  await db.insert(posts).values(memos as any);
  console.log(
    "Inserted memos:",
    memos.map((m) => ({ slug: m.slug, publishDate: m.publishDate, public: m.public }))
  );
}
>>>>>>> 71b001f (feat(memos): preserve attachments and required paths for non-admin views)
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
