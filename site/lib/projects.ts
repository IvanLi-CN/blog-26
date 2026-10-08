import {
  type ProjectCatalogItem,
  type ProjectDomain,
  type ProjectPublicEntry,
  type ProjectPublicEntryKind,
  type ProjectRelatedEntry,
  projectCatalog,
  projectDomains,
  type ResolvedProjectRelatedEntry,
} from "@/lib/project-catalog";
import type { PublicMemoRecord, PublicPostRecord, PublicSnapshot } from "@/public-site/snapshot";
import { getCanonicalUrl } from "./public-site-client";

export * from "@/lib/project-catalog";

export const projectCatalogBySlug = new Map(
  projectCatalog.map((project) => [project.slug, project])
);

export function getProjectBySlug(slug: string) {
  return projectCatalogBySlug.get(slug);
}

export function getProjectDetailPath(slug: string) {
  return `/projects/${slug}`;
}

export function getProjectCanonicalUrl(slug: string) {
  return getCanonicalUrl(getProjectDetailPath(slug));
}

export function getProjectDomainDefinition(domain: ProjectDomain) {
  return projectDomains.find((item) => item.id === domain) ?? projectDomains[0];
}

const publicEntryMeta: Record<ProjectPublicEntryKind, { label: string }> = {
  site: { label: "项目站点" },
  demo: { label: "Demo" },
  officialDocs: { label: "官方文档" },
  docs: { label: "文档" },
  repository: { label: "开源仓库" },
};

/** Return verified public destinations in the detail-sidebar order. */
export function getProjectPublicEntries(project: ProjectCatalogItem): ProjectPublicEntry[] {
  const legacy = new Map(project.links.map((link) => [link.kind, link.href]));
  const values: Array<[ProjectPublicEntryKind, string | undefined]> = [
    ["site", project.site ?? legacy.get("site")],
    ["demo", project.demo ?? legacy.get("demo")],
    ["officialDocs", project.officialDocs ?? legacy.get("docs")],
    ["docs", project.docs],
    ["repository", project.repository ?? legacy.get("github")],
  ];

  return values
    .filter((entry): entry is [ProjectPublicEntryKind, string] => Boolean(entry[1]))
    .map(([kind, href]) => ({ kind, href, label: publicEntryMeta[kind].label }));
}

/** Return one representative destination for the compact project-card actions. */
export function getProjectCardEntries(project: ProjectCatalogItem): ProjectPublicEntry[] {
  const entries = getProjectPublicEntries(project);
  const byKind = new Map(entries.map((entry) => [entry.kind, entry]));
  const online = byKind.get("site") ?? byKind.get("demo");
  const docs = byKind.get("officialDocs") ?? byKind.get("docs");
  return [online, docs, byKind.get("repository")].filter((entry): entry is ProjectPublicEntry =>
    Boolean(entry)
  );
}

export function getProjectsByDomain(domain: ProjectDomain) {
  return projectCatalog
    .filter((project) => project.domain === domain)
    .sort((left, right) => left.order - right.order);
}

export function getGroupedProjectCatalog() {
  return projectDomains.map((domain) => ({
    ...domain,
    projects: getProjectsByDomain(domain.id),
  }));
}

export function getFeaturedProjects() {
  return projectDomains
    .map((domain) => getProjectsByDomain(domain.id)[0])
    .filter((project): project is ProjectCatalogItem => Boolean(project));
}

function isPostRecord(entry: PublicPostRecord | PublicMemoRecord): entry is PublicPostRecord {
  return "publishDate" in entry;
}

export function resolveProjectRelatedEntries(
  snapshot: PublicSnapshot,
  entries: readonly ProjectRelatedEntry[]
): ResolvedProjectRelatedEntry[] {
  const resolvedEntries = entries.map((entry) => {
    if (entry.type === "post") {
      const post = snapshot.posts.find((item) => item.slug === entry.slug);
      if (!post) return null;
      return {
        ...entry,
        href: `/posts/${post.slug}`,
        title: entry.label ?? post.title,
        excerpt: post.excerpt,
      } satisfies ResolvedProjectRelatedEntry;
    }

    const memo = snapshot.memos.find((item) => item.slug === entry.slug);
    if (!memo) return null;
    return {
      ...entry,
      href: `/memos/${memo.slug}`,
      title: entry.label ?? memo.title,
      excerpt: memo.excerpt,
    } satisfies ResolvedProjectRelatedEntry;
  });

  return resolvedEntries
    .filter((entry): entry is ResolvedProjectRelatedEntry => entry !== null)
    .sort((left, right) => {
      const leftRecord =
        left.type === "post"
          ? snapshot.posts.find((item) => item.slug === left.slug)
          : snapshot.memos.find((item) => item.slug === left.slug);
      const rightRecord =
        right.type === "post"
          ? snapshot.posts.find((item) => item.slug === right.slug)
          : snapshot.memos.find((item) => item.slug === right.slug);

      if (!leftRecord || !rightRecord) return 0;

      const leftDate = isPostRecord(leftRecord)
        ? (leftRecord.updateDate ?? leftRecord.publishDate)
        : (leftRecord.updatedAt ?? leftRecord.publishedAt ?? leftRecord.createdAt);
      const rightDate = isPostRecord(rightRecord)
        ? (rightRecord.updateDate ?? rightRecord.publishDate)
        : (rightRecord.updatedAt ?? rightRecord.publishedAt ?? rightRecord.createdAt);

      return rightDate.localeCompare(leftDate);
    });
}
