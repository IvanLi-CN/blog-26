type SnippetSource = {
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
};

function cleanSearchText(value?: string | null) {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQueryTerms(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const terms = trimmed
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length <= 1) return [trimmed.toLowerCase()];
  return Array.from(new Set([...terms, trimmed].map((term) => term.toLowerCase())));
}

function findFirstMatch(text: string, terms: string[]) {
  const lowerText = text.toLowerCase();
  let firstIndex = -1;
  let firstTerm = "";

  for (const term of terms) {
    const index = lowerText.indexOf(term);
    if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
      firstTerm = term;
    }
  }

  return { index: firstIndex, term: firstTerm };
}

function cropSnippet(text: string, index: number, termLength: number) {
  const radius = 88;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + Math.max(termLength, 1) + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function buildSearchSnippet(query: string, source: SnippetSource) {
  const terms = getQueryTerms(query);
  const body = cleanSearchText(source.body);
  const excerpt = cleanSearchText(source.excerpt);
  const title = cleanSearchText(source.title);

  for (const text of [body, excerpt, title]) {
    if (!text) continue;
    const match = findFirstMatch(text, terms);
    if (match.index !== -1) return cropSnippet(text, match.index, match.term.length);
  }

  return excerpt || body.slice(0, 180).trim() || null;
}
