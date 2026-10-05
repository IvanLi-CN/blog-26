import { projectCatalog } from "@/lib/project-catalog";
import { buildTagDirectory, matchesTag, normalizeTagPath } from "@/lib/tag-directory";
import { type ContentReadOptions, readEligibleContent } from "@/server/services/tag-content";
import type { TaggedPost, TagSummary } from "@/types/tags";

export type TagServiceOptions = ContentReadOptions;

export async function getTagSummaries(options: TagServiceOptions = {}): Promise<TagSummary[]> {
  const content = await readEligibleContent(options);
  return buildTagDirectory([
    ...content.posts.map((post) => ({ type: "post" as const, id: post.id, tags: post.tags })),
    ...content.memos.map((memo) => ({ type: "memo" as const, id: memo.id, tags: memo.tags })),
    ...projectCatalog.map((project) => ({
      type: "project" as const,
      id: project.slug,
      tags: project.techTags,
    })),
  ]);
}

export async function getPostsByTag(
  tag: string,
  options: TagServiceOptions = {}
): Promise<TaggedPost[]> {
  const path = normalizeTagPath(tag);
  if (!path) return [];
  const { posts } = await readEligibleContent(options);
  return posts
    .filter((post) => matchesTag(path, post.tags))
    .map(({ title, slug, excerpt, tags }) => ({ title, slug, excerpt, tags }));
}

export async function groupPostsByTag(
  options: TagServiceOptions = {},
  limitPerTag?: number
): Promise<Array<{ tag: TagSummary; posts: TaggedPost[] }>> {
  const { posts } = await readEligibleContent(options);
  const summaries = buildTagDirectory(
    posts.map((post) => ({ type: "post" as const, id: post.id, tags: post.tags }))
  );
  return summaries.map((tag) => {
    const items = posts
      .filter((post) => matchesTag(tag.name, post.tags))
      .map(({ title, slug, excerpt, tags }) => ({ title, slug, excerpt, tags }));
    return { tag, posts: typeof limitPerTag === "number" ? items.slice(0, limitPerTag) : items };
  });
}

export function decodeTagFromPath(tagPath: string): string {
  try {
    return decodeURIComponent(tagPath);
  } catch {
    return tagPath;
  }
}
