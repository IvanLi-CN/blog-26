import MiniSearch from "minisearch";
import type {
  SearchResultGroup,
  SearchResultType,
  SearchSectionResult,
} from "@/components/search/search-model";
import { getPlaybookPolicies, playbookHref } from "./navigation";
import type { PlaybookPublicCatalog, PlaybookSearchDocument, PlaybookSearchPayload } from "./types";

export type PlaybookSearchPage = {
  href: string;
  title: string;
  type: SearchResultType;
  sections: Array<{ id: string; title: string; order: number }>;
};

/** Serialize only public display metadata from the exact edition bound to the search page. */
export function createPlaybookSearchPages(catalog: PlaybookPublicCatalog): PlaybookSearchPage[] {
  return [
    { href: "/playbook/topics/", title: "主题", type: "topic", sections: [] },
    { href: "/playbook/projects/", title: "项目实践", type: "experience", sections: [] },
    { href: "/playbook/policies/", title: "规则", type: "policy", sections: [] },
    ...catalog.topic_details.map(
      (detail): PlaybookSearchPage => ({
        href: playbookHref(`/topics/${detail.item.slug}`),
        title: detail.item.token,
        type: "topic",
        sections: detail.sections.map((section, order) => ({
          id: section.id,
          title: section.title,
          order,
        })),
      })
    ),
    ...catalog.project_details.map(
      (detail): PlaybookSearchPage => ({
        href: playbookHref(`/projects/${detail.item.slug}`),
        title: detail.title,
        type: "experience",
        sections: detail.sections.map((section, order) => ({
          id: section.id,
          title: section.title,
          order,
        })),
      })
    ),
    ...getPlaybookPolicies(catalog).map(
      (policy): PlaybookSearchPage => ({
        href: playbookHref(`/policies/${policy.summary.slug}`),
        title: policy.summary.name,
        type: "policy",
        sections: [
          { id: "installation", title: "手动安装", order: 0 },
          ...(policy.resources.length ? [{ id: "resources", title: "公开资源", order: 1 }] : []),
        ],
      })
    ),
  ];
}

export function tokenizePlaybookText(value: string) {
  return value.normalize("NFKC").match(/[\p{Script=Han}]|[a-z0-9]+/giu) ?? [];
}

export function buildPlaybookIndex(payload: PlaybookSearchPayload, pages: PlaybookSearchPage[]) {
  const pageMap = new Map(pages.map((page) => [page.href, page]));
  for (const document of payload.documents) {
    if (!pageMap.has(playbookHref(document.route).split("#")[0]))
      throw new Error("执念搜索引用了当前版本之外的内容");
  }
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
  return { index, pages: pageMap };
}

function matchingSnippet(document: PlaybookSearchDocument, query: string, matchedTerms: string[]) {
  const body = document.body;
  const normalizedCharacters = Array.from(body, (character) =>
    character.normalize("NFKC").toLowerCase()
  );
  const normalizedBody = normalizedCharacters.join("");
  let match = normalizedBody.indexOf(query.normalize("NFKC").toLowerCase());
  if (match < 0) {
    const offsets = matchedTerms.map((term) => normalizedBody.indexOf(term)).filter((n) => n >= 0);
    if (offsets.length) match = Math.min(...offsets);
  }
  // Translate the normalized match back to original text; never rewrite the displayed slice.
  if (match >= 0) {
    let offset = 0;
    let index = 0;
    for (const character of body) {
      const length = normalizedCharacters[index++].length;
      if (match < length) {
        match = offset;
        break;
      }
      match -= length;
      offset += character.length;
    }
  }
  let start = Math.max(0, match - 40);
  if (match >= 0) {
    for (const separator of body.slice(0, match).matchAll(/\r?\n[\t ]*\r?\n/g)) {
      start = Math.max(start, (separator.index ?? 0) + separator[0].length);
    }
  }
  return `${start ? "…" : ""}${body.slice(start, start + 180)}`;
}

export function queryPlaybookSearch(
  { index, pages }: ReturnType<typeof buildPlaybookIndex>,
  query: string,
  limit = 50
): SearchResultGroup[] {
  const term = query.trim();
  if (!term) return [];
  const groups = new Map<string, SearchResultGroup>();
  for (const result of index.search(term, {
    combineWith: "AND",
    fuzzy: query.length > 3 ? 0.12 : false,
    prefix: (_term, i, terms) => i === terms.length - 1,
  })) {
    const document = result.document as PlaybookSearchDocument;
    const rawHref = playbookHref(document.route, document.section_id);
    const canonicalHref = rawHref.split("#")[0];
    const page = pages.get(canonicalHref);
    if (!page) throw new Error("执念搜索引用了当前版本之外的内容");
    const sectionId = rawHref.includes("#") ? decodeURIComponent(rawHref.split("#")[1]) : undefined;
    const section =
      document.kind !== "page" ? page.sections.find((item) => item.id === sectionId) : undefined;
    const href = section ? playbookHref(canonicalHref, section.id) : canonicalHref;
    const snippet = matchingSnippet(document, term, result.terms);
    let group = groups.get(canonicalHref);
    if (!group) {
      group = {
        slug: canonicalHref,
        contentKey: JSON.stringify(["playbook", page.type, canonicalHref]),
        canonicalHref,
        title: page.title,
        type: page.type,
        href,
        source: "playbook",
        excerpt: document.subtitle,
        snippet,
        final: result.score,
        sections: [],
      };
      groups.set(canonicalHref, group);
    }
    if (section && !group.sections.some((item) => item.href === href)) {
      const hit: SearchSectionResult = {
        href,
        title: section.title,
        snippet,
        score: result.score,
        order: section.order,
      };
      group.sections.push(hit);
    }
  }
  for (const group of groups.values()) {
    group.sections.sort((a, b) => b.score - a.score || a.order - b.order);
    if (group.sections.length === 1) {
      group.href = group.sections[0].href;
      group.snippet = group.sections[0].snippet;
    }
  }
  // MiniSearch already orders by relevance. Map insertion retains its tie ordering.
  return [...groups.values()].slice(0, Math.max(0, limit));
}
