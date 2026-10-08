import { extractTextSummary } from "@/lib/markdown-utils";
import type { PlaybookEdition } from "@/lib/playbook/types";
import { calculateReadingTime } from "@/lib/reading-time";
import type { PublicSnapshot } from "@/public-site/snapshot";

export function postPreview<T extends PublicSnapshot["posts"][number]>(post: T) {
  return { ...post, readingMinutes: calculateReadingTime(post.body || ""), body: "" };
}

export function timelinePreviews<T extends { excerpt: string | null; content: string | null }>(
  items: T[]
) {
  return items.map((item) => ({
    ...item,
    excerpt: item.excerpt || extractTextSummary(item.content || "", 180),
    content: null,
  }));
}

export class PublicRouteNotFound extends Error {}

export interface PageContext {
  props: Record<string, unknown>;
  params: Record<string, string | undefined>;
  url: URL;
  request: Request;
  response: { status: number };
}

/** Only the current route's records may be serialized into its bootstrap. */
export function trimRouteSnapshot(
  snapshot: PublicSnapshot,
  kind: string,
  pathname: string
): PublicSnapshot;
export function trimRouteSnapshot(
  snapshot: PublicSnapshot | null,
  kind: string,
  pathname: string
): PublicSnapshot | null;
export function trimRouteSnapshot(
  snapshot: PublicSnapshot | null,
  kind: string,
  pathname: string
): PublicSnapshot | null {
  if (!snapshot) return null;
  const tagPath = decodeURIComponent(pathname.replace(/^.*\/tags\//, "").replace(/\/$/, ""));
  const tag = snapshot.tags.summaries.find(
    (item) => item.segments.join("/") === tagPath || item.name === tagPath
  );
  return {
    ...snapshot,
    posts: kind === "posts" ? snapshot.posts.map(postPreview) : [],
    memos: [],
    clippingArticles: {},
    tags: {
      ...snapshot.tags,
      summaries: kind === "tags" ? snapshot.tags.summaries : tag ? [tag] : [],
      timelines: {},
      projectsByTag: {},
    },
  };
}

export function trimRouteEdition(edition: PlaybookEdition | undefined, path: string) {
  if (!edition) return undefined;
  const [group, slug] = path.replace(/\/$/, "").split("/");
  return {
    ...edition,
    // Search has its own edition-bound endpoint and must not preload detail
    // bodies into every page's bootstrap or CSR response.
    search: { ...edition.search, documents: [] },
    catalog: {
      ...edition.catalog,
      topic_details: edition.catalog.topic_details.map((topic) => ({
        ...topic,
        doc_metadata: group === "topics" && topic.item.slug === slug ? topic.doc_metadata : [],
        sections: group === "topics" && topic.item.slug === slug ? topic.sections : [],
        policy_skills: topic.policy_skills.map((policy) => {
          const selected = group === "policies" && policy.summary.slug === slug;
          return {
            ...policy,
            frontmatter: selected ? policy.frontmatter : {},
            instruction_markdown: selected ? policy.instruction_markdown : "",
            resources: selected ? policy.resources : [],
          };
        }),
      })),
      project_details:
        group === "projects"
          ? edition.catalog.project_details.filter((item) => item.item.slug === slug)
          : [],
    },
  };
}
