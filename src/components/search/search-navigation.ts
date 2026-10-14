import type { SearchMode } from "@/lib/search/settings";
import type { SearchFilter } from "./search-model";

type SearchPlaybookIdentity = {
  edition: string;
  sourceReleaseId: string;
  sourceTag: string;
};

function setPlaybookIdentity(url: URL, playbook?: SearchPlaybookIdentity) {
  for (const key of ["edition", "sourceReleaseId", "sourceTag"]) url.searchParams.delete(key);
  if (!playbook) return;
  url.searchParams.set("edition", playbook.edition);
  url.searchParams.set("sourceReleaseId", playbook.sourceReleaseId);
  url.searchParams.set("sourceTag", playbook.sourceTag);
}

export function readSearchPlaybookIdentity(url: URL): SearchPlaybookIdentity | undefined {
  const edition = url.searchParams.get("edition");
  const sourceReleaseId = url.searchParams.get("sourceReleaseId");
  const sourceTag = url.searchParams.get("sourceTag");
  return edition && sourceReleaseId && sourceTag
    ? { edition, sourceReleaseId, sourceTag }
    : undefined;
}

export function readSearchQueryFromHref(href: string) {
  return new URL(href).searchParams.get("q")?.trim() ?? "";
}

export function buildSearchHref(
  currentHref: string,
  query: string,
  mode?: SearchMode,
  filter?: SearchFilter,
  playbook?: SearchPlaybookIdentity
) {
  const nextQuery = query.trim();
  const nextUrl = new URL(currentHref);
  if (nextQuery) nextUrl.searchParams.set("q", nextQuery);
  else nextUrl.searchParams.delete("q");
  if (mode) nextUrl.searchParams.set("mode", mode);
  if (filter && filter !== "all") nextUrl.searchParams.set("filter", filter);
  else nextUrl.searchParams.delete("filter");
  setPlaybookIdentity(nextUrl, playbook);
  return nextUrl.toString();
}

export function shouldPushSearchHref(
  currentHref: string,
  query: string,
  mode?: SearchMode,
  filter?: SearchFilter,
  playbook?: SearchPlaybookIdentity
) {
  const current = new URL(currentHref).searchParams;
  return (
    readSearchQueryFromHref(currentHref) !== query.trim() ||
    (mode !== undefined && (current.get("mode") ?? "keyword") !== mode) ||
    (filter !== undefined && (current.get("filter") ?? "all") !== filter) ||
    JSON.stringify(readSearchPlaybookIdentity(new URL(currentHref))) !== JSON.stringify(playbook)
  );
}
