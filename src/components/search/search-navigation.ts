import type { SearchMode } from "@/lib/search/settings";
export function readSearchQueryFromHref(href: string) {
  return new URL(href).searchParams.get("q")?.trim() ?? "";
}

export function buildSearchHref(currentHref: string, query: string, mode?: SearchMode) {
  const nextQuery = query.trim();
  const nextUrl = new URL(currentHref);
  if (nextQuery) nextUrl.searchParams.set("q", nextQuery);
  else nextUrl.searchParams.delete("q");
  if (mode) nextUrl.searchParams.set("mode", mode);
  return nextUrl.toString();
}

export function shouldPushSearchHref(currentHref: string, query: string, mode?: SearchMode) {
  return (
    readSearchQueryFromHref(currentHref) !== query.trim() ||
    (mode !== undefined && (new URL(currentHref).searchParams.get("mode") ?? "keyword") !== mode)
  );
}
