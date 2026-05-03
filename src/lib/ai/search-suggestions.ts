export type SearchSuggestionReason = "initial" | "empty" | "error" | "filtered_empty";

export type SearchSuggestionSeed = {
  title?: string | null;
  excerpt?: string | null;
  tags?: string[];
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

export function normalizeSearchSuggestions(
  suggestions: unknown,
  query: string,
  limit = 5
): string[] {
  const values = Array.isArray(suggestions) ? suggestions : [];
  const seen = new Set<string>();
  const normalizedQuery = normalizeKey(query);
  const terms: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const term = normalizeTerm(value);
    const key = normalizeKey(term);
    if (!isUsefulTerm(term) || key === normalizedQuery || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= limit) break;
  }

  return terms;
}

export function buildFallbackSearchSuggestions(
  query: string,
  seeds: SearchSuggestionSeed[] = [],
  limit = 5
) {
  const candidates = seeds.flatMap(extractCandidateTerms);
  const queryTokens = normalizeTerm(query).split(/\s+/).filter(Boolean);
  for (const token of queryTokens) pushCandidate(candidates, token);
  if (query.length > 4) {
    pushCandidate(candidates, query.slice(0, Math.max(2, Math.ceil(query.length / 2))));
  }

  const best = new Map<string, { term: string; score: number }>();
  const normalizedQuery = normalizeKey(query);
  candidates.forEach((candidate, index) => {
    const key = normalizeKey(candidate);
    if (!key || key === normalizedQuery) return;
    const score = scoreCandidate(candidate, query, index);
    const current = best.get(key);
    if (!current || score > current.score) {
      best.set(key, { term: normalizeTerm(candidate), score });
    }
  });

  return Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.term)
    .slice(0, limit);
}
