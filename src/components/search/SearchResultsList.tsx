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
    <ul className={cn("menu bg-base-100 p-0 w-full", containerClassName)}>
      {results.map((r) => {
        const type = (r.type || "post") as ResultType;
        const href = type === "memo" ? `/memos/${r.slug}` : `/posts/${r.slug}`;
        return (
          <li key={r.slug}>
            <Link href={href} className={linkClassName}>
              <div className="flex items-start gap-4">
                <div className="avatar placeholder">
                  <div className="bg-base-200 text-base-content/70 rounded w-10">
                    <span>{type === "memo" ? "M" : "P"}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate max-w-[75%]">{r.title || r.slug}</span>
                    <span className="badge badge-xs badge-outline capitalize">{type}</span>
                    {typeof r.final === "number" && (
                      <span className="badge badge-xs badge-ghost">
                        {(r.final * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {r.excerpt && (
                    <p className="text-sm text-base-content/70 line-clamp-2">{r.excerpt}</p>
                  )}
                  <div className="text-xs text-base-content/50">{href}</div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
