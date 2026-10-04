export type SearchResultType = "post" | "memo" | "topic" | "experience" | "policy";

export type SearchFilter = "all" | SearchResultType;

export type SearchResultItem = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  snippet?: string | null;
  type?: SearchResultType;
  href?: string;
  source?: "playbook";
  final?: number;
  cosine?: number;
};

export const searchFilters: Array<{ key: SearchFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "post", label: "文章" },
  { key: "memo", label: "闪念" },
  { key: "topic", label: "Topic" },
  { key: "experience", label: "项目实践" },
  { key: "policy", label: "Policy Skill" },
];

export function getSearchResultType(result: SearchResultItem): SearchResultType {
  return result.type ?? "post";
}

export function getSearchResultHref(result: SearchResultItem) {
  if (result.href?.startsWith("/playbook/")) return result.href;
  const type = getSearchResultType(result);
  return type === "memo" ? `/memos/${result.slug}` : `/posts/${result.slug}`;
}

export function getSearchResultTypeLabel(type: SearchResultType) {
  return {
    post: "文章",
    memo: "闪念",
    topic: "Topic",
    experience: "项目实践",
    policy: "Policy Skill",
  }[type];
}

export function getSearchResultIcon(type: SearchResultType) {
  return {
    post: "tabler:article",
    memo: "tabler:notes",
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
    { all: 0, post: 0, memo: 0, topic: 0, experience: 0, policy: 0 } satisfies Record<
      SearchFilter,
      number
    >
  );
}
