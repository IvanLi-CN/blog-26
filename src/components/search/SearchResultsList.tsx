import { cn } from "@/lib/utils";
import Icon from "../ui/Icon";
import {
  getSearchResultHref,
  getSearchResultIcon,
  getSearchResultType,
  getSearchResultTypeLabel,
  type SearchResultItem,
} from "./search-model";

export type { SearchResultItem } from "./search-model";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHighlightTerms(query?: string) {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const terms = trimmed
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length <= 1) return [trimmed];
  return Array.from(new Set([...terms, trimmed])).sort((a, b) => b.length - a.length);
}

function renderHighlightedText(text: string, query?: string, keyPrefix = "highlight") {
  const terms = getHighlightTerms(query);
  if (terms.length === 0) return text;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const value = match[0];
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark
        key={`${keyPrefix}-${index}-${value}`}
        className="rounded-[0.35em] bg-[rgba(var(--nature-accent-rgb),0.2)] px-1 py-0.5 font-semibold text-[color:var(--nature-accent-strong)]"
      >
        {value}
      </mark>
    );
    cursor = index + value.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function isCodeSnippetLine(line: string) {
  return /^ {4,}\S/.test(line);
}

function normalizeCodeSnippetLine(line: string) {
  return line.replace(/^ {4}/, "");
}

function getSnippetKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function getSnippetBlocks(snippet: string) {
  const blocks: Array<{
    kind: "text" | "code";
    key: string;
    lines: Array<{ key: string; value: string }>;
  }> = [];
  let blockSequence = 0;
  let lineSequence = 0;

  for (const line of snippet.split("\n")) {
    const kind = isCodeSnippetLine(line) ? "code" : "text";
    const previous = blocks.at(-1);
    if (previous?.kind === kind) {
      previous.lines.push({ key: `${lineSequence}-${getSnippetKey(line)}`, value: line });
    } else {
      blocks.push({
        kind,
        key: `${blockSequence}-${kind}-${getSnippetKey(line)}`,
        lines: [{ key: `${lineSequence}-${getSnippetKey(line)}`, value: line }],
      });
      blockSequence += 1;
    }
    lineSequence += 1;
  }

  return blocks;
}

function renderSnippet(snippet: string, query?: string) {
  return getSnippetBlocks(snippet).map((block) => {
    if (block.kind === "code") {
      const code = block.lines.map((line) => normalizeCodeSnippetLine(line.value)).join("\n");
      return (
        <pre
          key={block.key}
          className="my-1.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[rgba(var(--nature-accent-rgb),0.18)] bg-[rgba(var(--nature-accent-rgb),0.08)] px-3 py-1.5 font-mono text-[0.82rem] leading-5 text-[color:var(--nature-text-soft)]"
        >
          <code>{renderHighlightedText(code, query, block.key)}</code>
        </pre>
      );
    }

    return (
      <span key={block.key} className="block">
        {block.lines.map((line) =>
          line.value.trim() ? (
            <span key={line.key} className="block">
              {renderHighlightedText(line.value, query, line.key)}
            </span>
          ) : (
            <span key={line.key} aria-hidden="true" className="block h-1.5" />
          )
        )}
      </span>
    );
  });
}

export default function SearchResultsList({
  results,
  containerClassName,
  linkClassName,
  query,
  resolveHref = getSearchResultHref,
}: {
  results: SearchResultItem[];
  containerClassName?: string;
  linkClassName?: string;
  query?: string;
  resolveHref?: (result: SearchResultItem) => string;
}) {
  return (
    <ul className={cn("flex w-full flex-col gap-3 sm:gap-4", containerClassName)}>
      {results.map((r) => {
        const type = getSearchResultType(r);
        const href = resolveHref(r);
        const snippet = r.snippet || r.excerpt;
        const score =
          typeof r.final === "number"
            ? r.final
            : typeof r.cosine === "number"
              ? (r.cosine + 1) / 2
              : null;

        return (
          <li key={`${type}-${r.slug}`} className="list-none">
            <a
              href={href}
              aria-label={`打开 ${r.title || r.slug}`}
              className="nature-hover-hitbox group block"
              data-search-result-card
            >
              <div
                className={cn(
                  "nature-panel nature-panel-soft nature-hover-lift nature-hover-surface block px-0 py-0 [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.32)] [--nature-hover-lift-offset:-0.025rem]",
                  linkClassName
                )}
              >
                <div className="flex items-start gap-4 px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border border-[color:var(--nature-line)] bg-[rgba(var(--nature-accent-rgb),0.11)] text-[color:var(--nature-accent-strong)]">
                    <Icon name={getSearchResultIcon(type)} className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="nature-chip">{getSearchResultTypeLabel(type)}</span>
                      {score !== null && Number.isFinite(score) && (
                        <span className="nature-chip nature-chip-accent">
                          相关度 {Math.max(0, Math.min(100, Math.round(score * 100)))}%
                        </span>
                      )}
                      {query && (
                        <span className="text-xs text-[color:var(--nature-text-faint)]">
                          匹配 {query}
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 line-clamp-2 font-heading text-xl font-semibold leading-7 text-[color:var(--nature-text)] transition-colors group-hover:text-[color:var(--nature-accent-strong)]">
                      {r.title || r.slug}
                    </h2>

                    {snippet && (
                      <div className="nature-muted mt-2 break-words text-sm leading-6">
                        {renderSnippet(snippet, query)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
