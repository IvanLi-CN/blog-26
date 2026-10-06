import { type ProjectCatalog, projectCatalog } from "@/lib/project-catalog";
import { buildTagDirectory, matchesTag, normalizeTags } from "@/lib/tag-directory";
import { parseContentTags } from "@/lib/tag-parser";
import type { PublicSnapshot, PublicTagTimelineItem } from "@/public-site/snapshot";

/** Recompose legacy and current bundles against this build's catalog, without runtime I/O. */
export function rebuildSnapshotTags(
  snapshot: PublicSnapshot,
  catalog: ProjectCatalog = projectCatalog
): PublicSnapshot {
  const posts = snapshot.posts.map((post) => ({ ...post, tags: normalizeTags(post.tags) }));
  const memos = snapshot.memos
    .filter((memo) => memo.isPublic)
    .map((memo) => ({
      ...memo,
      tags: normalizeTags([
        ...memo.tags,
        ...parseContentTags(memo.content).tags.map((tag) => tag.name),
      ]),
    }));
  const summaries = buildTagDirectory([
    ...posts.map((post) => ({ type: "post" as const, id: post.id, tags: post.tags })),
    ...memos.map((memo) => ({ type: "memo" as const, id: memo.id, tags: memo.tags })),
    ...catalog.map((project) => ({
      type: "project" as const,
      id: project.slug,
      tags: project.techTags,
    })),
  ]);
  const names = new Set(summaries.map((summary) => summary.name));
  const projectsByTag: Record<string, string[]> = {};
  const timelines: Record<string, PublicTagTimelineItem[]> = {};
  for (const name of names) {
    projectsByTag[name] = [...catalog]
      .sort((a, b) => a.order - b.order)
      .filter((project) => matchesTag(name, project.techTags))
      .map((project) => project.slug);
    const items = [
      ...posts
        .filter((post) => matchesTag(name, post.tags))
        .map((post) => ({
          id: post.id,
          item: {
            type: "post" as const,
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            content: null,
            publishDate: post.publishDate,
            tags: post.tags,
            image: post.image,
            media: post.media,
            dataSource: post.dataSource,
            filePath: post.filePath,
          },
        })),
      ...memos
        .filter((memo) => matchesTag(name, memo.tags))
        .map((memo) => ({
          id: memo.id,
          item: {
            type: "memo" as const,
            slug: memo.slug,
            title: memo.title,
            excerpt: memo.excerpt,
            content: memo.content,
            publishDate: memo.publishedAt ?? memo.createdAt,
            tags: memo.tags,
            image: memo.image,
            media: memo.media,
            dataSource: memo.dataSource,
            filePath: memo.filePath,
          },
        })),
    ].sort(
      (a, b) =>
        b.item.publishDate.localeCompare(a.item.publishDate) ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    );
    timelines[name] = items.map(({ item }) => item);
  }
  const groups = snapshot.tags.groups
    .map((group) => ({
      ...group,
      tags: normalizeTags(group.tags).filter((name) => names.has(name)),
    }))
    .filter((group) => group.tags.length > 0);
  const tagIconMap = Object.fromEntries(
    Object.entries(snapshot.tags.tagIconMap).filter(([name]) => names.has(name))
  );
  const iconIds = new Set([...Object.values(tagIconMap), "tabler:hash"]);
  return {
    ...snapshot,
    posts,
    memos,
    tags: {
      summaries,
      groups,
      timelines,
      projectsByTag,
      categoryIcons: Object.fromEntries(
        Object.entries(snapshot.tags.categoryIcons).filter(([key]) =>
          groups.some((group) => group.key === key)
        )
      ),
      tagIconMap,
      tagIconSvgMap: Object.fromEntries(
        Object.entries(snapshot.tags.tagIconSvgMap).filter(([id]) => iconIds.has(id))
      ),
    },
  };
}

export function getTaggedProjects(path: string) {
  return [...projectCatalog]
    .sort((a, b) => a.order - b.order)
    .filter((project) => matchesTag(path, project.techTags))
    .map((project) => ({
      slug: project.slug,
      title: project.title,
      summary: project.summary,
      domain: project.domain,
      tags: project.techTags,
      path: `/projects/${project.slug}`,
    }));
}
