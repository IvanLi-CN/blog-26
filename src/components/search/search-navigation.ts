export function readSearchQueryFromHref(href: string) {
  return new URL(href).searchParams.get("q")?.trim() ?? "";
}

export function buildSearchHref(currentHref: string, query: string) {
  const nextQuery = query.trim();
  const nextUrl = new URL(currentHref);
  if (nextQuery) nextUrl.searchParams.set("q", nextQuery);
  else nextUrl.searchParams.delete("q");
  return nextUrl.toString();
}

export function shouldPushSearchHref(currentHref: string, query: string) {
  return readSearchQueryFromHref(currentHref) !== query.trim();
}
