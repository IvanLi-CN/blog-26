import MiniSearch from "minisearch";
import type { SearchResultItem } from "@/components/search/search-model";
import { playbookHref } from "./navigation";
import type { PlaybookSearchDocument, PlaybookSearchPayload } from "./types";

export function tokenizePlaybookText(value: string) {
  return value.normalize("NFKC").match(/[\p{Script=Han}]|[a-z0-9]+/giu) ?? [];
}

export function buildPlaybookIndex(payload: PlaybookSearchPayload) {
  const index = new MiniSearch({
    fields: ["title", "subtitle", "body", "keywords"],
    storeFields: ["document"],
    tokenize: tokenizePlaybookText,
    processTerm: (term) => term.normalize("NFKC").toLowerCase(),
    searchOptions: { boost: { title: 4, keywords: 3, subtitle: 2, body: 1 } },
  });
  index.addAll(
    payload.documents.map((document) => ({
      ...document,
      subtitle: document.subtitle ?? "",
      keywords: document.keywords.join(" "),
      document,
    }))
  );
  return index;
}

export function queryPlaybookSearch(
  index: ReturnType<typeof buildPlaybookIndex>,
  query: string,
  limit = 50
): SearchResultItem[] {
  if (!query.trim()) return [];
  return index
    .search(query.trim(), {
      combineWith: "AND",
      fuzzy: query.length > 3 ? 0.12 : false,
      prefix: (_term, i, terms) => i === terms.length - 1,
    })
    .slice(0, limit)
    .map((result) => {
      const document = result.document as PlaybookSearchDocument;
      const href = playbookHref(document.route, document.section_id);
      const type = document.route.includes("/policies/")
        ? "policy"
        : document.route.includes("/projects/")
          ? "experience"
          : "topic";
      const body = document.body.replace(/\s+/gu, " ");
      const match = body.toLowerCase().indexOf(query.trim().toLowerCase());
      const start = Math.max(0, match - 40);
      return {
        slug: document.id,
        title: document.title,
        type,
        href,
        source: "playbook",
        excerpt: document.subtitle,
        snippet: `${start ? "…" : ""}${body.slice(start, start + 180)}`,
        final: result.score,
      };
    });
}
