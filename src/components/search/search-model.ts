export type SearchResultType = "post" | "memo";

export type SearchFilter = "all" | SearchResultType;

export type SearchResultItem = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  type?: SearchResultType;
  final?: number;
  cosine?: number;
};

export const searchFilters: Array<{ key: SearchFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "post", label: "文章" },
  { key: "memo", label: "闪念" },
];

export function getSearchResultType(result: SearchResultItem): SearchResultType {
  return result.type === "memo" ? "memo" : "post";
}

export function getSearchResultHref(result: SearchResultItem) {
  const type = getSearchResultType(result);
  return type === "memo" ? `/memos/${result.slug}` : `/posts/${result.slug}`;
}

export function getSearchResultTypeLabel(type: SearchResultType) {
  return type === "memo" ? "闪念" : "文章";
}

export function getSearchResultIcon(type: SearchResultType) {
  return type === "memo" ? "tabler:notes" : "tabler:article";
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
    { all: 0, post: 0, memo: 0 } satisfies Record<SearchFilter, number>
  );
}
