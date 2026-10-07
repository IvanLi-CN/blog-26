import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { SITE } from "@/config/site";
import type { ClippingReading } from "@/lib/memo-clipping";
import { projectCatalog } from "@/lib/project-catalog";
import type { PublicMediaCollection } from "@/lib/public-media";
import { rebuildSnapshotTags } from "@/lib/snapshot-tags";
import { buildTagDirectory } from "@/lib/tag-directory";
import { readEligibleContent } from "@/server/services/tag-content";
import { readTagGroupsFromDB } from "@/server/services/tag-groups";
import { resolveTagIconSvgsForTags } from "@/server/services/tag-icon-ssr";
import { getAllCategoryIcons } from "@/server/services/tag-icons";
import type { TagSummary } from "@/types/tags";

export { resolvePublicMemoTitle } from "@/server/services/tag-content";

export interface PublicPostRecord {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  publishDate: string;
  updateDate: string | null;
  category: string | null;
  tags: string[];
  author: string | null;
  image: string | null;
  media: PublicMediaCollection;
  dataSource: string | null;
  filePath: string;
  metadata: Record<string, unknown>;
}

export interface PublicMemoRecord {
  id: string;
  slug: string;
  title: string | null;
  excerpt: string | null;
  content: string;
  tags: string[];
  clipping?: ClippingReading;
  inlineTags: string[];
  isPublic: boolean;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  dataSource: string | null;
  filePath: string;
  image: string | null;
  media: PublicMediaCollection;
}

export type PublicClippingArticle = {
  source: string | null;
  translation: string | null;
  reading: ClippingReading;
};

export type PublicTagSummary = TagSummary;

export interface PublicTagTimelineItem {
  clipping?: ClippingReading;
  type: "post" | "memo";
  slug: string;
  title: string | null;
  excerpt: string | null;
  content: string | null;
  publishDate: string;
  tags: string[];
  image: string | null;
  media: PublicMediaCollection;
  dataSource: string | null;
  filePath: string;
}

export interface PublicSnapshot {
  generatedAt: string;
  site: typeof SITE;
  stats: {
    totalPosts: number;
    categories: Array<{ name: string; count: number }>;
  };
  posts: PublicPostRecord[];
  memos: PublicMemoRecord[];
  clippingArticles?: Record<string, PublicClippingArticle>;
  relatedPosts: Record<string, string[]>;
  tags: {
    summaries: PublicTagSummary[];
    groups: Array<{ key: string; title: string; tags: string[] }>;
    categoryIcons: Record<string, string | null>;
    tagIconMap: Record<string, string | null>;
    tagIconSvgMap: Record<string, string | null>;
    timelines: Record<string, PublicTagTimelineItem[]>;
    projectsByTag?: Record<string, string[]>;
  };
}

function buildRelatedPosts(postList: PublicPostRecord[]): Record<string, string[]> {
  return Object.fromEntries(
    postList.map((post) => {
      const related = postList
        .filter((candidate) => candidate.slug !== post.slug)
        .filter((candidate) => {
          if (post.category && candidate.category) {
            return candidate.category === post.category;
          }
          return candidate.tags.some((tag) => post.tags.includes(tag));
        })
        .slice(0, 5)
        .map((candidate) => candidate.slug);
      return [post.slug, related];
    })
  );
}

export async function buildPublicSnapshot(): Promise<PublicSnapshot> {
  const {
    posts: postList,
    memos: memoList,
    clippingArticles,
  } = await readEligibleContent({ includeClippingArticles: true });
  const tagSummaries = buildTagDirectory([
    ...postList.map((post) => ({ type: "post" as const, id: post.id, tags: post.tags })),
    ...memoList.map((memo) => ({ type: "memo" as const, id: memo.id, tags: memo.tags })),
    ...projectCatalog.map((project) => ({
      type: "project" as const,
      id: project.slug,
      tags: project.techTags,
    })),
  ]);
  const [tagGroupsConfig, categoryIcons] = await Promise.all([
    readTagGroupsFromDB(),
    getAllCategoryIcons(),
  ]);
  const { iconMap, svgMap } = await resolveTagIconSvgsForTags(
    tagSummaries.map((tag) => tag.name),
    {
      svgHeight: "20",
      includeHashFallback: true,
    }
  );

  const categories = new Map<string, number>();
  for (const post of postList) {
    if (!post.category) continue;
    categories.set(post.category, (categories.get(post.category) ?? 0) + 1);
  }

  return rebuildSnapshotTags({
    generatedAt: new Date().toISOString(),
    site: SITE,
    stats: {
      totalPosts: postList.length,
      categories: Array.from(categories.entries()).map(([name, count]) => ({ name, count })),
    },
    posts: postList,
    memos: memoList,
    clippingArticles,
    relatedPosts: buildRelatedPosts(postList),
    tags: {
      summaries: tagSummaries,
      groups: tagGroupsConfig.groups,
      categoryIcons,
      tagIconMap: iconMap,
      tagIconSvgMap: svgMap,
      timelines: {},
    },
  });
}

export async function writePublicSnapshot(outputPath: string) {
  const snapshot = await buildPublicSnapshot();
  await Bun.write(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  const directory = join(dirname(outputPath), "clippings");
  await mkdir(directory, { recursive: true });
  const ownershipPath = join(directory, ".managed-articles.json");
  let previous: string[] = [];
  try {
    const parsed: unknown = JSON.parse(await readFile(ownershipPath, "utf8"));
    if (Array.isArray(parsed))
      previous = parsed.filter(
        (name): name is string =>
          typeof name === "string" &&
          name === basename(name) &&
          name.endsWith(".json") &&
          !name.startsWith(".")
      );
  } catch {
    /* First export has no managed artifacts. */
  }
  const current = Object.keys(snapshot.clippingArticles ?? {}).map(
    (slug) => `${encodeURIComponent(slug)}.json`
  );
  for (const [slug, article] of Object.entries(snapshot.clippingArticles ?? {}))
    await writeFile(
      join(directory, `${encodeURIComponent(slug)}.json`),
      `${JSON.stringify(article)}\n`
    );
  for (const name of previous.filter((name) => !current.includes(name)))
    await unlink(join(directory, name)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  await writeFile(ownershipPath, `${JSON.stringify(current)}\n`);
  return snapshot;
}
