"use client";

import { CalendarDays, Clock3, Eye, FileText, PencilLine, Tag, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import { calculateReadingTime, formatReadingTime } from "@/lib/reading-time";
import { cn } from "@/lib/utils";
import { formatDateTime } from "~/pages/helpers";

type PreviewTagProps = {
  tags: string[];
};

type PreviewMetaItem = {
  icon: ReactNode;
  label: string;
};

type PreviewHero = {
  src: string;
  alt: string;
};

type PreviewArticleShellProps = {
  modeLabel?: string;
  title: string;
  description?: string | null;
  tags?: string[];
  meta: PreviewMetaItem[];
  hero?: PreviewHero | null;
  bodyTestId: string;
  body: string;
  articlePath: string;
  publicMediaContext: {
    kind: "post" | "memo";
    slug: string;
    filePath: string;
    assetScope?: "public" | "admin-preview";
  };
  bodyClassName?: string;
  leadingControls?: ReactNode;
};

function PreviewTags({ tags }: PreviewTagProps) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border border-border/62 bg-muted/62 px-3 py-1 text-xs text-muted-foreground shadow-inner shadow-shadow-inset"
        >
          <Tag className="size-3" />
          {tag}
        </span>
      ))}
    </div>
  );
}

function PreviewMeta({ items }: { items: PreviewMetaItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
      {items.map((item) => (
        <span
          key={`${item.label}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/72 px-3 py-1.5 shadow-sm shadow-shadow-soft"
        >
          {item.icon}
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

function PreviewHeroImage({ hero }: { hero: PreviewHero }) {
  return (
    <figure
      className="overflow-hidden rounded-[1.75rem] border border-border/56 bg-muted/38 shadow-lg shadow-shadow-soft"
      data-testid="admin-preview-hero"
    >
      <div className="relative bg-[radial-gradient(circle_at_top,color-mix(in_oklch,var(--color-primary)_10%,transparent),transparent_56%)]">
        {/* biome-ignore lint/performance/noImgElement: Admin preview runs in a Vite SPA and needs direct facade URLs without Next.js image primitives. */}
        <img
          src={hero.src}
          alt={hero.alt}
          loading="lazy"
          decoding="async"
          className="aspect-[16/9] w-full object-cover"
        />
      </div>
    </figure>
  );
}

export function buildPreviewReadingMeta(body: string) {
  return formatReadingTime(calculateReadingTime(body || ""));
}

export function buildPostPreviewMeta(post: {
  publishDate?: string | number | null;
  updateDate?: string | number | null;
  author?: string | null;
  category?: string | null;
  body: string;
}) {
  const items: PreviewMetaItem[] = [];
  if (post.publishDate) {
    items.push({
      icon: <CalendarDays className="size-3.5" />,
      label: formatDateTime(post.publishDate),
    });
  }
  if (post.updateDate) {
    items.push({
      icon: <PencilLine className="size-3.5" />,
      label: `更新于 ${formatDateTime(post.updateDate)}`,
    });
  }
  if (post.author) {
    items.push({
      icon: <UserRound className="size-3.5" />,
      label: post.author,
    });
  }
  if (post.category) {
    items.push({
      icon: <FileText className="size-3.5" />,
      label: post.category,
    });
  }
  items.push({
    icon: <Clock3 className="size-3.5" />,
    label: buildPreviewReadingMeta(post.body),
  });
  return items;
}

export function buildMemoPreviewMeta(memo: {
  createdAt?: string | number | null;
  publishedAt?: string | number | null;
  updatedAt?: string | number | null;
  isPublic: boolean;
}) {
  const primaryTime = memo.publishedAt ?? memo.createdAt ?? memo.updatedAt;
  const items: PreviewMetaItem[] = [];
  if (primaryTime) {
    items.push({
      icon: <CalendarDays className="size-3.5" />,
      label: formatDateTime(primaryTime),
    });
  }
  items.push({
    icon: <Eye className="size-3.5" />,
    label: memo.isPublic ? "公开 Memo" : "私有 Memo",
  });
  if (memo.updatedAt) {
    items.push({
      icon: <PencilLine className="size-3.5" />,
      label: `更新于 ${formatDateTime(memo.updatedAt)}`,
    });
  }
  return items;
}

function normalizeInlineAssetCandidate(raw: string | null | undefined) {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//iu.test(value) || value.startsWith("/") || value.startsWith(".")) {
    return value;
  }
  if (value.startsWith("<") && value.endsWith(">")) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function PreviewArticleShell({
  modeLabel = "预览模式",
  title,
  description,
  tags = [],
  meta,
  hero,
  bodyTestId,
  body,
  articlePath,
  publicMediaContext,
  bodyClassName,
  leadingControls,
}: PreviewArticleShellProps) {
  return (
    <article className="space-y-6 rounded-[2rem] border border-border/58 bg-card/88 p-6 shadow-xl shadow-shadow-soft lg:p-7">
      {leadingControls ? <div className="flex justify-end">{leadingControls}</div> : null}

      <header className="space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/62 bg-muted/58 px-3 py-1 text-xs text-muted-foreground shadow-inner shadow-shadow-inset">
          <Eye className="size-3.5" />
          {modeLabel}
        </div>

        <PreviewMeta items={meta} />

        <div className="space-y-3">
          <h1 className="max-w-[18ch] text-balance text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p
              data-testid="admin-preview-description"
              className="max-w-[70ch] text-pretty text-base leading-7 text-muted-foreground sm:text-[1.02rem]"
            >
              {description}
            </p>
          ) : null}
        </div>

        {tags.length > 0 ? <PreviewTags tags={tags} /> : null}
      </header>

      {hero ? <PreviewHeroImage hero={hero} /> : null}

      <div
        className={cn(
          "admin-editor-preview rounded-[1.6rem] border border-border/54 bg-background/88 px-5 py-6 shadow-inner shadow-shadow-inset sm:px-6",
          bodyClassName
        )}
        data-testid={bodyTestId}
      >
        <MarkdownRenderer
          content={body || ""}
          variant="article"
          surface="admin"
          articlePath={articlePath}
          contentSource="local"
          publicMediaContext={publicMediaContext}
          enableImageLightbox
          enableMath
          enableMermaid
          enableCodeFolding
        />
      </div>
    </article>
  );
}

export function buildPreviewHero(src: string | null | undefined, alt: string): PreviewHero | null {
  const normalized = normalizeInlineAssetCandidate(src);
  if (!normalized) return null;
  return { src: normalized, alt };
}
