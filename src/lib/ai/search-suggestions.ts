export type SearchSuggestionReason = "initial" | "empty" | "error" | "filtered_empty";

export type SearchSuggestionSeed = {
  title?: string | null;
  excerpt?: string | null;
  tags?: string[];
};

export type SearchSuggestionStrategy =
  | "broader_by_domain"
  | "related"
  | "sibling"
  | "alternative_label";

export type SearchSuggestionItem = {
  term: string;
  strategy: SearchSuggestionStrategy;
  concept?: string;
  domain?: string;
  rationale?: string;
  score?: number;
  resultCount?: number;
};

const STRATEGY_WEIGHTS: Record<SearchSuggestionStrategy, number> = {
  broader_by_domain: 20,
  alternative_label: 18,
  related: 16,
  sibling: 14,
};

const TECH_STOP_WORDS = new Set([
  "and",
  "with",
  "the",
  "for",
  "from",
  "into",
  "notes",
  "memo",
  "deep",
  "dive",
  "content",
  "delete",
  "development",
  "environment",
  "local",
  "public",
  "seed",
  "setup",
  "test",
  "testing",
  "e2e",
  "page",
  "pages",
  "admin",
  "删除测试",
  "测试",
  "开发",
  "环境",
  "本地开发",
  "分享一些本地开发",
]);

const VALID_STRATEGIES = new Set<SearchSuggestionStrategy>([
  "broader_by_domain",
  "related",
  "sibling",
  "alternative_label",
]);

const CONCEPT_RELATION_HINTS: Array<{
  aliases: string[];
  items: SearchSuggestionItem[];
}> = [
  {
    aliases: ["zettelkasten", "zettel", "卡片盒", "卡片笔记"],
    items: [
      {
        term: "知识管理",
        strategy: "broader_by_domain",
        concept: "Zettelkasten",
        domain: "notes",
        rationale: "Zettelkasten can be a method inside personal knowledge management.",
      },
      {
        term: "双链笔记",
        strategy: "related",
        concept: "Zettelkasten",
        domain: "notes",
        rationale: "Bidirectional notes are often discussed near Zettelkasten workflows.",
      },
      {
        term: "Evergreen Notes",
        strategy: "sibling",
        concept: "Zettelkasten",
        domain: "notes",
        rationale: "Evergreen notes are a sibling note-making method.",
      },
      {
        term: "卡片笔记",
        strategy: "alternative_label",
        concept: "Zettelkasten",
        domain: "notes",
        rationale: "Chinese writing often names Zettelkasten as card notes.",
      },
    ],
  },
  {
    aliases: ["arch", "arch linux", "pacman"],
    items: [
      {
        term: "Linux",
        strategy: "broader_by_domain",
        concept: "Arch Linux",
        domain: "operating systems",
      },
      {
        term: "Pacman",
        strategy: "related",
        concept: "Arch Linux",
        domain: "operating systems",
      },
      {
        term: "NixOS",
        strategy: "sibling",
        concept: "Arch Linux",
        domain: "operating systems",
      },
      {
        term: "Arch Linux",
        strategy: "alternative_label",
        concept: "Arch",
        domain: "operating systems",
      },
    ],
  },
  {
    aliases: ["react hooks", "react hook", "hooks", "hook"],
    items: [
      {
        term: "React",
        strategy: "broader_by_domain",
        concept: "React Hooks",
        domain: "frontend",
      },
      {
        term: "useEffect",
        strategy: "related",
        concept: "React Hooks",
        domain: "frontend",
      },
      {
        term: "Vue Composition API",
        strategy: "sibling",
        concept: "React Hooks",
        domain: "frontend",
      },
      {
        term: "Hooks",
        strategy: "alternative_label",
        concept: "React Hooks",
        domain: "frontend",
      },
    ],
  },
  {
    aliases: ["react"],
    items: [
      {
        term: "前端框架",
        strategy: "broader_by_domain",
        concept: "React",
        domain: "frontend",
      },
      {
        term: "React Hooks",
        strategy: "related",
        concept: "React",
        domain: "frontend",
      },
      {
        term: "Vue.js",
        strategy: "sibling",
        concept: "React",
        domain: "frontend",
      },
      {
        term: "Svelte",
        strategy: "sibling",
        concept: "React",
        domain: "frontend",
      },
    ],
  },
  {
    aliases: ["webdav", "dav"],
    items: [
      {
        term: "文件同步",
        strategy: "broader_by_domain",
        concept: "WebDAV",
        domain: "storage",
      },
      {
        term: "WebDAV",
        strategy: "related",
        concept: "WebDAV",
        domain: "storage",
      },
      {
        term: "S3",
        strategy: "sibling",
        concept: "WebDAV",
        domain: "storage",
      },
      {
        term: "DAV",
        strategy: "alternative_label",
        concept: "WebDAV",
        domain: "storage",
      },
    ],
  },
];

function normalizeTerm(value: string) {
  return value.trim().normalize("NFKC").replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeTerm(value).toLowerCase();
}

function isUsefulTerm(value: string) {
  const term = normalizeTerm(value);
  if (term.length < 2 || term.length > 32) return false;
  if (/^[\p{P}\p{S}\s]+$/u.test(term)) return false;
  if (TECH_STOP_WORDS.has(term.toLowerCase())) return false;
  return true;
}

function normalizeStrategy(value: unknown): SearchSuggestionStrategy {
  return typeof value === "string" && VALID_STRATEGIES.has(value as SearchSuggestionStrategy)
    ? (value as SearchSuggestionStrategy)
    : "related";
}

function pushCandidate(candidates: string[], value: string | null | undefined) {
  if (!value) return;
  const term = normalizeTerm(value.replace(/^#+\s*/, ""));
  if (isUsefulTerm(term)) candidates.push(term);
}

function extractCandidateTerms(seed: SearchSuggestionSeed) {
  const candidates: string[] = [];
  for (const tag of seed.tags ?? []) {
    const segments = tag
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    pushCandidate(candidates, segments.at(-1) ?? tag);
    pushCandidate(candidates, tag);
  }

  const title = seed.title ?? "";
  for (const match of title.matchAll(
    /[A-Za-z][A-Za-z0-9.+#-]{1,30}(?:\s+[A-Za-z][A-Za-z0-9.+#-]{1,30}){1,3}/g
  )) {
    pushCandidate(candidates, match[0]);
  }

  const text = `${title} ${seed.excerpt ?? ""}`;
  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9.+#-]{1,30}/g)) {
    pushCandidate(candidates, match[0]);
  }
  for (const match of text.matchAll(/[\p{Script=Han}]{2,8}/gu)) {
    pushCandidate(candidates, match[0]);
  }

  return candidates;
}

function queryTokens(query: string) {
  return normalizeKey(query)
    .split(/[\s/._-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TECH_STOP_WORDS.has(token));
}

function hasQueryRelation(value: string, query: string) {
  const text = normalizeKey(value);
  const normalizedQuery = normalizeKey(query);
  if (!text || !normalizedQuery) return false;
  if (text.includes(normalizedQuery) || normalizedQuery.includes(text)) return true;
  return queryTokens(query).some((token) => text.includes(token) || token.includes(text));
}

export function searchSuggestionItemRelatesToQuery(item: SearchSuggestionItem, query: string) {
  return [item.term, item.concept, item.domain, item.rationale].some(
    (value) => typeof value === "string" && hasQueryRelation(value, query)
  );
}

function seedMatchesQuery(seed: SearchSuggestionSeed, query: string) {
  const text = normalizeKey(
    [seed.title, seed.excerpt, ...(seed.tags ?? [])].filter(Boolean).join(" ")
  );
  return hasQueryRelation(text, query);
}

function scoreCandidate(term: string, query: string, index: number) {
  const normalizedTerm = normalizeKey(term);
  const normalizedQuery = normalizeKey(query);
  let score = Math.max(0, 120 - index);

  if (!normalizedQuery) return score;
  if (normalizedTerm === normalizedQuery) score -= 100;
  if (normalizedTerm.includes(normalizedQuery) || normalizedQuery.includes(normalizedTerm)) {
    score += 80;
  }

  const queryChars = new Set(Array.from(normalizedQuery).filter((char) => !/\s/.test(char)));
  const sharedChars = Array.from(new Set(Array.from(normalizedTerm))).filter((char) =>
    queryChars.has(char)
  ).length;
  score += sharedChars * 6;

  const lengthDistance = Math.abs(term.length - query.length);
  score -= lengthDistance * 0.8;
  return score;
}

function scoreSuggestionItem(item: SearchSuggestionItem, query: string, index: number) {
  return (
    scoreCandidate(item.term, query, index) +
    STRATEGY_WEIGHTS[item.strategy] +
    (hasQueryRelation(item.term, query) ? 24 : 0)
  );
}

export function normalizeSearchSuggestionItems(
  suggestions: unknown,
  query: string,
  limit = 5
): SearchSuggestionItem[] {
  const values = Array.isArray(suggestions) ? suggestions : [];
  const seen = new Set<string>();
  const normalizedQuery = normalizeKey(query);
  const items: SearchSuggestionItem[] = [];

  for (const value of values) {
    const rawItem =
      typeof value === "string"
        ? { term: value, strategy: "related" }
        : value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : null;
    if (!rawItem || typeof rawItem.term !== "string") continue;

    const term = normalizeTerm(rawItem.term);
    const key = normalizeKey(term);
    if (!isUsefulTerm(term) || key === normalizedQuery || seen.has(key)) continue;
    seen.add(key);
    items.push({
      term,
      strategy: normalizeStrategy(rawItem.strategy),
      concept: typeof rawItem.concept === "string" ? normalizeTerm(rawItem.concept) : undefined,
      domain: typeof rawItem.domain === "string" ? normalizeTerm(rawItem.domain) : undefined,
      rationale:
        typeof rawItem.rationale === "string" ? normalizeTerm(rawItem.rationale) : undefined,
    });
    if (items.length >= limit) break;
  }

  return items;
}

export function normalizeSearchSuggestions(
  suggestions: unknown,
  query: string,
  limit = 5
): string[] {
  return normalizeSearchSuggestionItems(suggestions, query, limit).map((item) => item.term);
}

export function buildFallbackSearchSuggestionItems(
  query: string,
  seeds: SearchSuggestionSeed[] = [],
  limit = 5
) {
  const candidates: SearchSuggestionItem[] = [];
  const normalizedQuery = normalizeKey(query);

  for (const hint of CONCEPT_RELATION_HINTS) {
    if (hint.aliases.some((alias) => hasQueryRelation(alias, query))) {
      candidates.push(...hint.items);
    }
  }

  for (const seed of seeds) {
    if (!seedMatchesQuery(seed, query)) continue;
    for (const term of extractCandidateTerms(seed)) {
      if (normalizeKey(term) === normalizedQuery) continue;
      candidates.push({
        term,
        strategy: hasQueryRelation(term, query) ? "alternative_label" : "related",
        concept: seed.title ?? undefined,
      });
    }
  }

  const best = new Map<string, SearchSuggestionItem & { score: number }>();
  for (const [index, candidate] of candidates.entries()) {
    const key = normalizeKey(candidate.term);
    if (!key || key === normalizedQuery) continue;
    const score = scoreSuggestionItem(candidate, query, index);
    const current = best.get(key);
    if (!current || score > current.score) {
      best.set(key, {
        term: normalizeTerm(candidate.term),
        score,
        strategy: candidate.strategy,
        concept: candidate.concept,
        domain: candidate.domain,
        rationale: candidate.rationale,
      });
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => ({
      term: item.term,
      strategy: item.strategy,
      concept: item.concept,
      domain: item.domain,
      rationale: item.rationale,
      score: item.score,
    }))
    .slice(0, limit);
}

export function buildFallbackSearchSuggestions(
  query: string,
  seeds: SearchSuggestionSeed[] = [],
  limit = 5
) {
  return buildFallbackSearchSuggestionItems(query, seeds, limit).map((item) => item.term);
}
