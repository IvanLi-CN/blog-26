import { useId, useState } from "react";
import Icon from "@/components/ui/Icon";
import { type SearchHighlightTerm, searchHighlightSpans } from "@/lib/search/highlights";
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

export const DEFAULT_AI_MARKER_ICON = "tabler:sparkles-2";

function renderHighlightedText(
  text: string,
  terms: SearchHighlightTerm[] = [],
  keyPrefix = "highlight"
) {
  const spans = searchHighlightSpans(text, terms);
  if (!spans.length) return text;
  const parts = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    parts.push(
      <mark
        key={`${keyPrefix}-${span.start}`}
        className="inline m-0 border-0 bg-[rgba(var(--nature-accent-rgb),0.2)] p-0 [font:inherit] text-[color:var(--nature-accent-strong)]"
      >
        {text.slice(span.start, span.end)}
      </mark>
    );
    cursor = span.end;
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

function renderSnippet(
  snippet: string,
  terms: SearchHighlightTerm[],
  proseLines?: 1 | 2,
  limitToParagraph = false
) {
  return getSnippetBlocks(snippet).map((block) => {
    if (block.kind === "code") {
      const code = block.lines.map((line) => normalizeCodeSnippetLine(line.value)).join("\n");
      return (
        <pre
          key={block.key}
          className="my-1.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[rgba(var(--nature-accent-rgb),0.18)] bg-[rgba(var(--nature-accent-rgb),0.08)] px-3 py-1.5 font-mono text-[0.82rem] leading-5 text-[color:var(--nature-text-soft)]"
        >
          <code>{renderHighlightedText(code, terms, block.key)}</code>
        </pre>
      );
    }

    const firstContentLine = block.lines.findIndex((line) => line.value.trim());
    const nextParagraph = block.lines.findIndex(
      (line, index) => index > firstContentLine && !line.value.trim()
    );
    const lines = limitToParagraph
      ? block.lines.slice(
          Math.max(0, firstContentLine),
          nextParagraph < 0 ? undefined : nextParagraph
        )
      : block.lines;
    return (
      <span key={block.key} className={proseLines ? `line-clamp-${proseLines}` : "block"}>
        {lines.map((line) =>
          line.value.trim() ? (
            <span key={line.key} className="block">
              {renderHighlightedText(line.value, terms, line.key)}
            </span>
          ) : (
            <span key={line.key} aria-hidden="true" className="block h-1.5" />
          )
        )}
      </span>
    );
  });
}

export function SearchResultCard({
  result: r,
  query,
  expanded,
  onToggle,
  linkClassName,
  resolveHref = getSearchResultHref,
  aiMarkerIcon = DEFAULT_AI_MARKER_ICON,
}: {
  result: SearchResultGroup;
  query?: string;
  expanded: boolean;
  onToggle: () => void;
  linkClassName?: string;
  resolveHref?: (result: SearchResultItem) => string;
  aiMarkerIcon?: string;
}) {
  const sectionsId = useId();
  const type = getSearchResultType(r);
  const snippet = r.snippet || r.excerpt;
  const terms =
    r.highlightTerms ??
    (r.source === "playbook"
      ? (query
          ?.split(/\s+/u)
          .filter(Boolean)
          .map((value) => ({ value })) ?? [])
      : []);
  const isMemo = type === "memo" || type === "clipping";
  const displayTitle = isMemo ? r.title?.trim() || "" : r.title || r.slug;
  const accessibleTitle = isMemo
    ? r.title?.trim() || `无标题${getSearchResultTypeLabel(type)}`
    : r.title || r.slug;
  const showSections = r.sections.length >= 2;
  const visibleSections = expanded ? r.sections : r.sections.slice(0, 3);

  return (
    <li className="nature-mobile-reading-row list-none" data-search-content-key={r.contentKey}>
      <div
        className={cn(
          "nature-panel nature-hover-lift search-result-card nature-panel-soft min-w-0 overflow-hidden px-0 py-0",
          linkClassName
        )}
      >
        <a
          href={resolveHref(r)}
          aria-label={`打开${getSearchResultTypeLabel(type)}：${accessibleTitle}`}
          className="group block min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[color:var(--nature-accent-strong)]"
          data-search-result-card
        >
          <div data-search-result-content className="px-4 py-4 sm:px-5 sm:py-5">
            {r.searchOrigin === "ai" && (
              <span
                role="img"
                aria-label="AI 补充结果"
                className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center text-[color:var(--nature-accent-strong)]"
                title="AI 补充结果"
              >
                <Icon name={aiMarkerIcon} className="h-5 w-5" />
              </span>
            )}
            <div className="flex items-baseline gap-3">
              {displayTitle ? (
                <h2
                  className={cn(
                    "min-w-0 line-clamp-2 font-heading text-lg font-semibold leading-7 text-[color:var(--nature-accent-strong)] underline-offset-4 group-hover:underline sm:text-xl",
                    r.searchOrigin === "ai" && "pr-8"
                  )}
                >
                  {renderHighlightedText(displayTitle, terms)}
                </h2>
              ) : null}
              <span className="nature-content-type-chip inline-flex shrink-0 items-center gap-1 py-1 text-xs text-[color:var(--nature-text-soft)]">
                <Icon
                  name={getSearchResultIcon(type)}
                  className="nature-content-type-icon inline h-3.5 w-3.5 sm:hidden"
                />
                <span className="sr-only sm:not-sr-only">{getSearchResultTypeLabel(type)}</span>
              </span>
            </div>
            {query && (
              <span className="sr-only" data-search-match-meta>
                搜索 {query}
              </span>
            )}
            {snippet && (
              <div
                data-search-snippet
                className={cn(
                  "nature-muted mt-2 w-full max-w-none overflow-hidden break-words text-sm leading-6",
                  showSections ? "max-h-12" : "max-h-48"
                )}
              >
                {renderSnippet(snippet, terms, 2, r.source === "playbook")}
              </div>
            )}
          </div>
        </a>
        {showSections && (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <ul
              id={sectionsId}
              aria-label={`${accessibleTitle}的匹配章节`}
              className="ml-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2"
            >
              {visibleSections.map((section) => (
                <li key={section.href} className="min-w-0 list-none">
                  <a
                    href={resolveHref({ ...r, href: section.href })}
                    className="group block min-h-11 py-2 text-[color:var(--nature-text-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent-strong)]"
                    data-search-section
                  >
                    <h3 className="text-sm font-medium leading-6 text-[color:var(--nature-accent-strong)] underline-offset-4 group-hover:underline">
                      {section.title}
                    </h3>
                    <div
                      data-search-snippet
                      className="mt-1 max-h-36 w-full max-w-none overflow-hidden break-words text-sm leading-6"
                    >
                      {renderSnippet(section.snippet, terms, 2, true)}
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
                className="mt-1 ml-3 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm text-[color:var(--nature-accent-strong)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent-strong)]"
              >
                {expanded ? "收起更多匹配" : `展开更多匹配（${r.sections.length - 3}）`}
                <Icon
                  name={expanded ? "tabler:chevron-up" : "tabler:chevron-down"}
                  className="h-4 w-4"
                />
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
  aiMarkerIcon = DEFAULT_AI_MARKER_ICON,
}: {
  results: Array<SearchResultItem | SearchResultGroup>;
  containerClassName?: string;
  linkClassName?: string;
  query?: string;
  resolveHref?: (result: SearchResultItem) => string;
  expandedContentKeys?: ReadonlySet<string>;
  onToggleContent?: (key: string) => void;
  aiMarkerIcon?: string;
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
          aiMarkerIcon={aiMarkerIcon}
        />
      ))}
    </ul>
  );
}
