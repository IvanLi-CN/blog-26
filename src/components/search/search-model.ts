export type SearchResultType = "post" | "memo" | "topic" | "experience" | "policy";

export type SearchDisplayType = SearchResultType | "clipping";
export type SearchFilter = "all" | SearchDisplayType;

export type SearchResultItem = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  snippet?: string | null;
  type?: SearchResultType;
  isClipping?: boolean;
  href?: string;
  source?: "playbook";
  final?: number;
  cosine?: number;
};

export type SearchSectionResult = {
  href: string;
  title: string;
  snippet: string;
  score: number;
  order: number;
};

/** Display model only; public search responses retain their original array shape. */
export type SearchResultGroup = SearchResultItem & {
  contentKey: string;
  canonicalHref: string;
  sections: SearchSectionResult[];
};

export function groupSearchResults(
  results: Array<SearchResultItem | SearchResultGroup>
): SearchResultGroup[] {
  const groups = new Map<string, SearchResultGroup>();
  for (const result of results) {
    const canonicalHref = getSearchResultHref(result).split("#")[0];
    const contentKey = JSON.stringify([
      result.source ?? "blog",
      getSearchResultType(result),
      canonicalHref,
    ]);
    if (groups.has(contentKey)) continue;
    groups.set(contentKey, {
      ...result,
      contentKey,
      canonicalHref,
      sections: "sections" in result ? result.sections : [],
    });
  }
  return [...groups.values()];
}

export function isSearchResultGroup(value: unknown): value is SearchResultGroup {
  if (!value || typeof value !== "object") return false;
  const result = value as SearchResultGroup;
  const nullableText = (field: unknown) => field == null || typeof field === "string";
  const optionalNumber = (field: unknown) => field === undefined || Number.isFinite(field);
  return (
    typeof result.slug === "string" &&
    nullableText(result.title) &&
    nullableText(result.excerpt) &&
    nullableText(result.snippet) &&
    (result.href === undefined || typeof result.href === "string") &&
    (result.source === undefined || result.source === "playbook") &&
    (result.type === undefined ||
      ["post", "memo", "topic", "experience", "policy"].includes(result.type)) &&
    optionalNumber(result.final) &&
    optionalNumber(result.cosine) &&
    typeof result.contentKey === "string" &&
    typeof result.canonicalHref === "string" &&
    Array.isArray(result.sections) &&
    result.sections.every(
      (section) =>
        section &&
        typeof section.href === "string" &&
        typeof section.title === "string" &&
        typeof section.snippet === "string" &&
        Number.isFinite(section.score) &&
        Number.isFinite(section.order)
    )
  );
}

export const searchFilters: Array<{ key: SearchFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "post", label: "文章" },
  { key: "memo", label: "闪念" },
  { key: "clipping", label: "剪藏" },
  { key: "topic", label: "Topic" },
  { key: "experience", label: "项目实践" },
  { key: "policy", label: "Policy Skill" },
];

export function getSearchResultType(result: SearchResultItem): SearchDisplayType {
  if (result.type === "memo" && result.isClipping) return "clipping";
  return result.type ?? "post";
}

export function getSearchResultHref(result: SearchResultItem) {
  if (result.href?.startsWith("/playbook/")) return result.href;
  const type = getSearchResultType(result);
  return type === "memo" || type === "clipping" ? `/memos/${result.slug}` : `/posts/${result.slug}`;
}

export function getSearchResultTypeLabel(type: SearchDisplayType) {
  return {
    post: "文章",
    memo: "闪念",
    clipping: "剪藏",
    topic: "Topic",
    experience: "项目实践",
    policy: "Policy Skill",
  }[type];
}

export function getSearchResultIcon(type: SearchDisplayType) {
  return {
    post: "tabler:article",
    memo: "tabler:notes",
    clipping: "tabler:scissors",
    topic: "tabler:book",
    experience: "tabler:code",
    policy: "tabler:checklist",
  }[type];
}

export function filterSearchResults(results: SearchResultItem[], filter: SearchFilter) {
  if (filter === "all") return results;
  return results.filter((result) => getSearchResultType(result) === filter);
}

export function countSearchResultsByType(results: SearchResultItem[]) {
  return results.reduce(
    (counts, result) => {
      counts[getSearchResultType(result)] += 1;
      counts.all += 1;
      return counts;
    },
    { all: 0, post: 0, memo: 0, clipping: 0, topic: 0, experience: 0, policy: 0 } satisfies Record<
      SearchFilter,
      number
    >
  );
}
