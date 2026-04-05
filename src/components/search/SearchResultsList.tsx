"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type ResultType = "post" | "memo";

export type SearchResultItem = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  type?: ResultType;
  final?: number;
  cosine?: number;
};

export default function SearchResultsList({
  results,
  containerClassName,
  linkClassName = "!py-3",
}: {
  results: SearchResultItem[];
  containerClassName?: string;
  linkClassName?: string;
}) {
  return (
    <ul className={cn("flex w-full flex-col gap-3", containerClassName)}>
      {results.map((r) => {
        const type = (r.type || "post") as ResultType;
        const href = type === "memo" ? `/memos/${r.slug}` : `/posts/${r.slug}`;
        return (
          <li key={r.slug} className="list-none">
            <Link
              href={href}
              className={cn("nature-panel nature-panel-soft block px-4 py-4", linkClassName)}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.22)] text-[color:var(--nature-text-soft)]">
                  <span>{type === "memo" ? "M" : "P"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="max-w-[75%] truncate font-medium">{r.title || r.slug}</span>
                    <span className="nature-chip capitalize">{type}</span>
                    {typeof r.final === "number" && (
                      <span className="nature-chip nature-chip-accent">
                        {(r.final * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {r.excerpt && <p className="nature-muted line-clamp-2 text-sm">{r.excerpt}</p>}
                  <div className="text-xs text-[color:var(--nature-text-faint)]">{href}</div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
