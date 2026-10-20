import type { SearchMode } from "@/lib/search/settings";
import type { SearchFilter } from "./search-model";

const LEGACY_PLAYBOOK_SEARCH_KEYS = ["edition", "sourceReleaseId", "sourceTag"] as const;

export function stripLegacySearchPlaybookIdentity(url: URL) {
  let changed = false;
  for (const key of LEGACY_PLAYBOOK_SEARCH_KEYS) {
    if (url.searchParams.has(key)) changed = true;
    url.searchParams.delete(key);
  }
  return changed;
}

export function readSearchQueryFromHref(href: string) {
  return new URL(href).searchParams.get("q")?.trim() ?? "";
}

export function buildSearchHref(
  currentHref: string,
  query: string,
  mode?: SearchMode,
  filter?: SearchFilter
) {
  const nextQuery = query.trim();
  const nextUrl = new URL(currentHref);
  if (nextQuery) nextUrl.searchParams.set("q", nextQuery);
  else nextUrl.searchParams.delete("q");
  if (mode) nextUrl.searchParams.set("mode", mode);
  if (filter && filter !== "all") nextUrl.searchParams.set("filter", filter);
  else nextUrl.searchParams.delete("filter");
  stripLegacySearchPlaybookIdentity(nextUrl);
  return nextUrl.toString();
}

export function shouldPushSearchHref(
  currentHref: string,
  query: string,
  mode?: SearchMode,
  filter?: SearchFilter
) {
  const current = new URL(currentHref).searchParams;
  return (
    readSearchQueryFromHref(currentHref) !== query.trim() ||
    (mode !== undefined && (current.get("mode") ?? "keyword") !== mode) ||
    (filter !== undefined && (current.get("filter") ?? "all") !== filter) ||
    LEGACY_PLAYBOOK_SEARCH_KEYS.some((key) => current.has(key))
  );
}
