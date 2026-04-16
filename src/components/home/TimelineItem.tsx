"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "../../hooks/useAuth";
import { detectContentAnomalies } from "../../lib/content-anomalies";
import { resolveImagePath } from "../../lib/image-utils";
import { optimizeForPreview } from "../../lib/markdown-utils";
import { formatRelativeTime } from "../../lib/utils";
import PostTags from "../blog/PostTags";
import MarkdownRenderer from "../common/MarkdownRenderer";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import Icon from "../ui/Icon";

interface TimelineItemProps {
  item: {
    type: "post" | "memo";
    id: string;
    slug: string;
    title?: string;
    content?: string;
    body?: string;
    excerpt?: string;
    publishDate: Date;
    tags?: string[];
    image?: string;
    permalink?: string;
    dataSource?: string;
  };
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
  isLast?: boolean;
  loading?: boolean;
}

export default function TimelineItem({
  item,
  tagIconMap,
  tagIconSvgMap,
  isLast = false,
  loading = false,
}: TimelineItemProps) {
  const { isAdmin } = useAuth();

  // 检测异常（仅针对 memo 内容）
  const anomalies =
    item.type === "memo" ? detectContentAnomalies(item.content || item.body || "") : null;

  // 根据类型确定链接
  const itemUrl =
    item.type === "memo" ? `/memos/${item.slug}` : item.permalink || `/posts/${item.slug}`;

  // 格式化时间
  const formatDate = (date: Date) => formatRelativeTime(date) ?? "未知时间";

  // 获取类型图标和颜色
  const getTypeIcon = (type: string) => {
    return type === "memo" ? "tabler:bulb" : "tabler:article";
  };

  // 使用 DaisyUI 语义色而不是硬编码颜色，确保与主题一致
  const getTypeColor = (type: string) => {
    return type === "memo"
      ? "text-[color:var(--nature-secondary)]"
      : "text-[color:var(--nature-accent-strong)]";
  };

  return (
    <article
      className="nature-timeline-item timeline-item"
      data-is-last={isLast}
      data-testid="timeline-item"
    >
      <div className="nature-timeline-rail" aria-hidden="true">
        <div
          className="nature-timeline-node"
          data-testid="timeline-node"
          data-timeline-kind={item.type}
        >
          {loading ? (
            <div className="nature-skeleton h-5 w-5 rounded-full"></div>
          ) : (
            <Icon
              name={getTypeIcon(item.type)}
              className={`w-5 h-5 ${getTypeColor(item.type)} inline-block`}
            />
          )}
        </div>

        {!isLast && (
          <div
            className="nature-timeline-connector timeline-connector"
            data-testid="timeline-connector"
          />
        )}
      </div>

      <div className="nature-timeline-content pb-1 sm:pb-2">
        <div className="flex items-center gap-2 mb-2">
          {loading ? (
            <>
              <div className="nature-skeleton h-4 w-20 rounded-full"></div>
              <div className="nature-skeleton h-5 w-12 rounded-full"></div>
            </>
          ) : (
            <>
              <span className="nature-muted text-sm md:text-base">
                {formatDate(item.publishDate)}
              </span>
              <span className="nature-chip text-xs">{item.type === "memo" ? "闪念" : "文章"}</span>
            </>
          )}
        </div>

        {/* 内容卡片 */}
        {loading ? (
          <div className="nature-panel nature-panel-soft nature-timeline-card">
            <div className="nature-panel-body p-3 sm:p-4">
              <div className="nature-skeleton mb-2 h-20 rounded-[1rem]"></div>
              <div className="nature-skeleton mb-1 h-3 w-3/4 rounded-full"></div>
              <div className="nature-skeleton h-3 w-1/2 rounded-full"></div>
            </div>
          </div>
        ) : (
          <div className="nature-hover-hitbox group block">
            <div className="nature-panel nature-panel-soft nature-hover-lift nature-hover-surface nature-timeline-card [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.3)] [--nature-hover-lift-offset:-0.125rem] [--nature-hover-shadow:0_22px_42px_rgba(8,21,16,0.14)]">
              <div className="nature-panel-body p-3 sm:p-4">
                {item.type === "post" && (
                  <div className="flex gap-4">
                    {item.image && (
                      <div className="flex-shrink-0">
                        <Image
                          src={
                            resolveImagePath(
                              item.image,
                              (item.dataSource === "local" ? "local" : "webdav") as
                                | "local"
                                | "webdav",
                              item.id
                            ) || ""
                          }
                          alt={item.title || "文章封面"}
                          className="h-20 w-20 rounded-[1rem] object-cover sm:h-24 sm:w-24"
                          width={96}
                          height={96}
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {item.title && (
                        <Link href={itemUrl} className="block">
                          <h3 className="nature-title mb-2 line-clamp-2 text-lg font-semibold transition-colors hover:text-[color:var(--nature-accent-strong)] md:text-xl">
                            {item.title}
                          </h3>
                        </Link>
                      )}

                      {item.excerpt && (
                        <p className="nature-muted line-clamp-3 text-sm md:text-base">
                          {item.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {item.type === "memo" && (
                  <>
                    {(item.content || item.body) && (
                      <div className="memo-content">
                        <MarkdownRenderer
                          content={optimizeForPreview(item.content || item.body || "", {
                            maxLength: 200,
                            maxParagraphs: 2,
                            removeImages: true,
                            simplifyHeadings: true,
                          })}
                          variant="preview"
                          enableMath={true}
                          enableMermaid={false}
                          enableCodeFolding={false}
                          enableImageLightbox={false}
                          maxCodeLines={5}
                          previewCodeLines={3}
                          articlePath={`/memos/${item.slug}`}
                          className="nature-prose-preview prose prose-sm max-w-none text-sm md:text-base [&_h1]:text-base [&_h1]:font-medium [&_h2]:text-sm [&_h2]:font-medium [&_h3]:text-sm [&_h3]:font-medium [&_img]:max-h-24 [&_img]:object-cover [&_img]:rounded-2xl [&_blockquote]:text-xs [&_blockquote]:py-1 [&_ul]:text-sm [&_ol]:text-sm"
                        />
                      </div>
                    )}
                    <div className="mt-3">
                      <Link
                        href={itemUrl}
                        className="nature-feedback-link inline-flex items-center gap-1 text-sm transition-all duration-200 hover:gap-2"
                      >
                        查看详情
                        <span className="text-xs">→</span>
                      </Link>
                    </div>

                    {isAdmin && anomalies?.hasInlineDataImages && (
                      <div className="mt-2 flex items-center gap-2 text-[color:var(--nature-warning)]">
                        <span
                          className="inline-flex items-center gap-1 text-xs"
                          title={
                            (anomalies.details || []).join("；") ||
                            "检测到异常数据：包含 base64 内嵌图片"
                          }
                        >
                          <Icon name="tabler:alert-triangle" className="w-4 h-4" />
                          <span>异常数据</span>
                        </span>
                      </div>
                    )}
                  </>
                )}

                {item.tags && item.tags.length > 0 && (
                  <PostTags
                    tags={item.tags.slice(0, 3)}
                    className="flex flex-wrap gap-1 mt-3"
                    iconMap={tagIconMap}
                    iconSvgMap={tagIconSvgMap}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
