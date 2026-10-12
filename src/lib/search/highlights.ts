import type { SearchQueryAst } from "./query";

export type SearchHighlightTerm = { value: string; prefix?: boolean };
export function positiveSearchTerms(ast: SearchQueryAst | null): SearchHighlightTerm[] {
  if (!ast) return [];
  switch (ast.kind) {
    case "term":
    case "phrase":
      return [{ value: ast.value }];
    case "prefix":
      return [{ value: ast.value, prefix: true }];
    case "column":
      return positiveSearchTerms(ast.child);
    case "not":
      return positiveSearchTerms(ast.include);
    case "and":
    case "or":
      return ast.children.flatMap(positiveSearchTerms);
    default:
      return [];
  }
}

/** Preserve document spelling; only queries use NFKC and ASCII case is ignored. */
export function searchHighlightSpans(text: string, terms: SearchHighlightTerm[]) {
  const asciiLower = (value: string) => value.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
  let normalized = "";
  const offsets: Array<{ start: number; end: number }> = [];
  let offset = 0;
  for (const character of text) {
    const value = asciiLower(character);
    normalized += value;
    for (let i = 0; i < value.length; i++)
      offsets.push({ start: offset, end: offset + character.length });
    offset += character.length;
  }
  const continuation = (value: string | undefined) => Boolean(value && /[a-z0-9_+#]/iu.test(value));
  const spans: Array<{ start: number; end: number }> = [];
  for (const term of terms) {
    const value = asciiLower(term.value.normalize("NFKC"));
    if (!value) continue;
    let from = 0;
    while (from < normalized.length) {
      const start = normalized.indexOf(value, from);
      if (start < 0) break;
      const end = start + value.length;
      from = start + Math.max(1, value.length);
      if (continuation(value[0]) && continuation(normalized[start - 1])) continue;
      if (!term.prefix && continuation(value.at(-1)) && continuation(normalized[end])) continue;
      spans.push({ start: offsets[start].start, end: offsets[end - 1].end });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  return spans.filter(
    (span, index) => !spans.slice(0, index).some((previous) => previous.end > span.start)
  );
}
