type SnippetSource = {
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
};

function formatCodeFence(code: string) {
  const lines = code.replace(/\n+$/g, "").split("\n");
  return `\n${lines
    .map((line) => (line.trim() ? `    ${line.replace(/\t/g, "  ").trimEnd()}` : ""))
    .join("\n")}\n`;
}

function cleanSearchText(value?: string | null) {
  const formatted = (value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>"])/g, "$1")
    .replace(/(^|[\s([{])\\([^\\\n]{1,80})\\(?=$|[\s)\]},.，。；;:：!?！？])/g, "$1$2")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => formatCodeFence(code))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[\w:-]+(?:\s+[^<>]*?)?\/?>/g, " ")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, " ")
    .replace(/\*\*|__|~~/g, "")
    .replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s)\]},.，。；;:：!?！?])/g, "$1$2")
    .replace(/(^|[\s([{])_([^_\n]+)_(?=$|[\s)\]},.，。；;:：!?！?])/g, "$1$2")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return formatted
    .split("\n")
    .map((line) => {
      const [, indent = "", text = ""] = line.match(/^(\s*)(.*)$/) ?? [];
      return `${indent.slice(0, 12)}${text.replace(/[ \t]{2,}/g, " ").trimEnd()}`;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
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
  const radius = 140;
  const rawStart = Math.max(0, index - radius);
  const rawEnd = Math.min(text.length, index + Math.max(termLength, 1) + radius);
  const lineStart = text.lastIndexOf("\n", rawStart);
  const nextLineEnd = text.indexOf("\n", rawEnd);
  const start = lineStart === -1 ? 0 : lineStart + 1;
  const end = nextLineEnd === -1 ? text.length : nextLineEnd;
  const prefix = start > 0 ? "...\n" : "";
  const suffix = end < text.length ? "\n..." : "";
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
