import type { PageContext } from "../route-data-utils";

export async function loadsearch(context: PageContext) {
  return {
    query: context.url.searchParams.get("q") ?? "",
    mode: context.url.searchParams.get("mode") ?? "keyword",
  };
}
