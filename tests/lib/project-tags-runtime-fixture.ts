import { db, initializeDB } from "../../src/lib/db";
import { posts } from "../../src/lib/schema";
import { projectTagsFixture } from "./project-tags-fixture";

if (!process.env.DB_PATH || !process.env.LOCAL_CONTENT_BASE_PATH) {
  throw new Error("Explicit isolated DB_PATH and LOCAL_CONTENT_BASE_PATH are required");
}
await initializeDB();
if ((await db.select({ id: posts.id }).from(posts).limit(1)).length) {
  throw new Error("Runtime fixture requires an empty database");
}
const fixture = projectTagsFixture();
await db.insert(posts).values([
  ...fixture.posts.map((post) => ({
    id: post.id,
    slug: post.slug,
    type: "post",
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    publishDate: Date.parse(post.publishDate),
    tags: JSON.stringify(post.tags),
    public: true,
    draft: false,
    contentHash: "controlled-fixture",
    dataSource: "database",
    source: "database",
    filePath: post.filePath,
  })),
  ...fixture.memos.map((memo) => ({
    id: memo.id,
    slug: memo.slug,
    type: "memo",
    title: memo.title ?? "",
    excerpt: memo.excerpt,
    body: memo.content,
    publishDate: Date.parse(memo.publishedAt ?? memo.createdAt),
    tags: JSON.stringify(memo.tags),
    public: true,
    draft: false,
    contentHash: "controlled-fixture",
    dataSource: "database",
    source: "database",
    filePath: memo.filePath,
  })),
]);
console.log("Seeded isolated project-tag runtime fixture");
