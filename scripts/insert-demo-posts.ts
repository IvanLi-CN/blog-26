#!/usr/bin/env bun
import { eq } from "drizzle-orm";
import { db, initializeDB } from "../src/lib/db";
import { posts } from "../src/lib/schema";

function toSec(ts: number) {
  return Math.floor(ts / 1000);
}
async function main() {
  await initializeDB(true);
  const now = Date.now();
  const A = {
    id: `blog/post-a-${now}.md`,
    slug: `post-a-${Math.random().toString(36).slice(2, 8)}`,
    type: "post" as const,
    title: "Post A",
    excerpt: "A with relative cover",
    body: "# Post A\nHello.",
    publishDate: toSec(now - 60000),
    updateDate: toSec(now - 60000),
    draft: false,
    public: true,
    category: "Demo",
    tags: JSON.stringify(["demo"]),
    author: "demo@local",
    image: "./assets/vue3-composition-api.jpg",
    metadata: JSON.stringify({}),
    dataSource: "webdav",
    contentHash: `hash-${now}`,
    lastModified: toSec(now),
    source: "webdav",
    filePath: `blog/post-a-${now}.md`,
  };
  const B = {
    id: `blog/post-b-${now}.md`,
    slug: `post-b-${Math.random().toString(36).slice(2, 8)}`,
    type: "post" as const,
    title: "Post B",
    excerpt: "B with relative cover",
    body: "# Post B\nWorld.",
    publishDate: toSec(now - 30000),
    updateDate: toSec(now - 30000),
    draft: false,
    public: true,
    category: "Demo",
    tags: JSON.stringify(["demo"]),
    author: "demo@local",
    image: "./assets/docker-best-practices.jpg",
    metadata: JSON.stringify({}),
    dataSource: "webdav",
    contentHash: `hash-${now + 1}`,
    lastModified: toSec(now),
    source: "webdav",
    filePath: `blog/post-b-${now}.md`,
  };
  for (const p of [A, B]) {
    await db.delete(posts).where(eq(posts.id, p.id));
  }
  await db.insert(posts).values([A, B] as any);
  console.log("Inserted posts:", [A.slug, B.slug]);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
