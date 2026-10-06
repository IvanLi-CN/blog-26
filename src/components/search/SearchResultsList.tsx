import { useId, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import {
  getSearchResultHref,
  getSearchResultIcon,
  getSearchResultType,
  getSearchResultTypeLabel,
  groupSearchResults,
  type SearchResultGroup,
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
        className="inline m-0 border-0 bg-[rgba(var(--nature-accent-rgb),0.2)] p-0 [font:inherit] [letter-spacing:inherit] [word-spacing:inherit] [white-space:inherit] text-[color:var(--nature-accent-strong)]"
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

function formatScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

export function SearchResultCard({
  result: r,
  query,
  expanded,
  onToggle,
  linkClassName,
  resolveHref = getSearchResultHref,
}: {
  result: SearchResultGroup;
  query?: string;
  expanded: boolean;
  onToggle: () => void;
  linkClassName?: string;
  resolveHref?: (result: SearchResultItem) => string;
}) {
  const sectionsId = useId();
  const type = getSearchResultType(r);
  const snippet = r.snippet || r.excerpt;
  const score =
    typeof r.final === "number"
      ? r.final
      : typeof r.cosine === "number"
        ? (r.cosine + 1) / 2
        : null;
  const displayTitle = type === "memo" ? r.title?.trim() || "" : r.title || r.slug;
  const accessibleTitle = type === "memo" ? r.title?.trim() || "无标题闪念" : r.title || r.slug;
  const showSections = r.sections.length >= 2;
  const visibleSections = expanded ? r.sections : r.sections.slice(0, 3);

  return (
    <li className="nature-mobile-reading-row list-none" data-search-content-key={r.contentKey}>
      <div
        className={cn(
          "nature-panel search-result-card nature-panel-soft min-w-0 overflow-hidden px-0 py-0",
          linkClassName
        )}
      >
        <a
          href={resolveHref(r)}
          aria-label={`打开${getSearchResultTypeLabel(type)}：${accessibleTitle}`}
          className="nature-hover-hitbox group block"
          data-search-result-card
        >
          <div className="nature-hover-surface px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="nature-chip nature-content-type-chip gap-1">
                <Icon
                  name={getSearchResultIcon(type)}
                  className="nature-content-type-icon inline h-3.5 w-3.5 sm:hidden"
                />
                <span className="sr-only sm:not-sr-only">{getSearchResultTypeLabel(type)}</span>
              </span>
              {query && (
                <span
                  className="text-xs text-[color:var(--nature-text-faint)]"
                  data-search-match-meta
                >
                  匹配 {query}
                </span>
              )}
              {r.source !== "playbook" && score !== null && Number.isFinite(score) && (
                <span
                  className="text-xs text-[color:var(--nature-text-faint)] opacity-75"
                  data-search-relevance-meta
                >
                  相关度 {formatScore(score)}%
                </span>
              )}
            </div>
            {displayTitle ? (
              <h2 className="mt-2 line-clamp-2 font-heading text-lg font-semibold leading-7 text-[color:var(--nature-text)] transition-colors group-hover:text-[color:var(--nature-accent-strong)] sm:text-xl">
                {displayTitle}
              </h2>
            ) : null}
            {snippet && (
              <div
                data-search-snippet
                className="nature-muted mt-1.5 max-h-48 overflow-hidden break-words text-sm leading-6"
              >
                {renderSnippet(snippet, query)}
              </div>
            )}
          </div>
        </a>
        {showSections && (
          <div className="px-4 pb-3.5 sm:px-5 sm:pb-4">
            <ul
              id={sectionsId}
              aria-label={`${accessibleTitle}的匹配章节`}
              className="ml-2 border-l border-[color:var(--nature-line)] pl-3 sm:ml-3 sm:pl-4"
            >
              {visibleSections.map((section) => (
                <li
                  key={section.href}
                  className="list-none border-t border-[color:var(--nature-line)] first:border-t-0"
                >
                  <a
                    href={resolveHref({ ...r, href: section.href })}
                    className="group block min-h-11 py-2.5 text-[color:var(--nature-text-soft)] hover:text-[color:var(--nature-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent-strong)]"
                    data-search-section
                  >
                    <h3 className="text-sm font-medium leading-6">{section.title}</h3>
                    <div
                      data-search-snippet
                      className="mt-1 max-h-36 overflow-hidden break-words text-sm leading-6"
                    >
                      {renderSnippet(section.snippet, query)}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
            {r.sections.length > 3 && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={sectionsId}
                onClick={onToggle}
                className="mt-1 inline-flex min-h-11 items-center rounded-md px-2 text-sm text-[color:var(--nature-accent-strong)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent-strong)]"
              >
                {expanded ? "收起更多匹配" : `展开更多匹配（${r.sections.length - 3}）`}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function SearchResultsList({
  results,
  containerClassName,
  linkClassName,
  query,
  resolveHref = getSearchResultHref,
  expandedContentKeys,
  onToggleContent,
}: {
  results: Array<SearchResultItem | SearchResultGroup>;
  containerClassName?: string;
  linkClassName?: string;
  query?: string;
  resolveHref?: (result: SearchResultItem) => string;
  expandedContentKeys?: ReadonlySet<string>;
  onToggleContent?: (key: string) => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(new Set<string>());
  const expanded = expandedContentKeys ?? localExpanded;
  const toggle =
    onToggleContent ??
    ((key: string) =>
      setLocalExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }));
  return (
    <ul
      className={cn(
        "nature-mobile-reading-stream flex w-full flex-col gap-3 sm:gap-4",
        containerClassName
      )}
    >
      {groupSearchResults(results).map((result) => (
        <SearchResultCard
          key={result.contentKey}
          result={result}
          query={query}
          expanded={expanded.has(result.contentKey)}
          onToggle={() => toggle(result.contentKey)}
          resolveHref={resolveHref}
          linkClassName={linkClassName}
        />
      ))}
    </ul>
  );
}
