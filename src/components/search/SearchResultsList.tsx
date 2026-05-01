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

                    {r.excerpt && (
                      <p className="nature-muted mt-2 line-clamp-2 text-sm leading-7">
                        {r.excerpt}
                      </p>
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
