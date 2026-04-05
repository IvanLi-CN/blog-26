"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
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
  const connectorRef = useRef<HTMLDivElement>(null);
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

  // 语义化背景色（淡色，无边框、无ring）
  const getTypeBgClass = (type: string) => {
    return type === "memo"
      ? "bg-[color:var(--nature-secondary-soft)]"
      : "bg-[color:var(--nature-accent-soft)]";
  };

  // 动态调整时间线连接线高度
  useEffect(() => {
    const adjustConnectorHeight = () => {
      if (!connectorRef.current || isLast) return;

      const currentItem = connectorRef.current.closest(".timeline-item") as HTMLElement;
      if (!currentItem) return;

      const nextItem = currentItem.nextElementSibling as HTMLElement;
      if (!nextItem) return;

      const currentRect = currentItem.getBoundingClientRect();
      const nextRect = nextItem.getBoundingClientRect();
      const nextNodeOffset = 32; // 下一个节点的大概位置

      const connectorHeight = nextRect.top - currentRect.top - 32 + nextNodeOffset;
      connectorRef.current.style.height = `${Math.max(connectorHeight, 80)}px`;
    };

    // 延迟执行以确保DOM已渲染
    const timer = setTimeout(adjustConnectorHeight, 100);

    // 监听窗口大小变化
    window.addEventListener("resize", adjustConnectorHeight);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", adjustConnectorHeight);
    };
  }, [isLast]);

  return (
    <div className="timeline-item relative flex items-start gap-3 sm:gap-4">
      {/* 时间线主轴和节点 */}
      <div className="flex flex-col items-center relative">
        {/* 时间线节点：干净的圆形，无明显边框。背景用语义色淡化 */}
        <div
          className={`z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--nature-line)] ${getTypeBgClass(item.type)} sm:h-10 sm:w-10`}
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

        {/* 时间线主轴（连接线） */}
        {!isLast && (
          <div
            ref={connectorRef}
            className="timeline-connector absolute left-1/2 top-8 w-0.5 -translate-x-1/2 bg-[linear-gradient(180deg,rgba(var(--nature-accent-rgb),0.22),transparent)] opacity-60 sm:top-10"
            style={{ height: "100vh" }}
          ></div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-w-0 pb-6 sm:pb-8">
        {/* 时间和类型信息 */}
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
          <div className="nature-panel nature-panel-soft">
            <div className="nature-panel-body p-3 sm:p-4">
              <div className="nature-skeleton mb-2 h-20 rounded-[1rem]"></div>
              <div className="nature-skeleton mb-1 h-3 w-3/4 rounded-full"></div>
              <div className="nature-skeleton h-3 w-1/2 rounded-full"></div>
            </div>
          </div>
        ) : (
          <div className="nature-panel nature-panel-soft">
            <div className="nature-panel-body p-3 sm:p-4">
              {item.type === "post" && (
                <div className="flex gap-4">
                  {/* 文章封面图 */}
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

                  {/* 文章内容 */}
                  <div className="flex-1 min-w-0">
                    {/* 文章标题 */}
                    {item.title && (
                      <Link href={itemUrl} className="block">
                        <h3 className="nature-title mb-2 line-clamp-2 text-lg font-semibold transition-colors hover:text-[color:var(--nature-accent-strong)] md:text-xl">
                          {item.title}
                        </h3>
                      </Link>
                    )}

                    {/* 文章摘要 */}
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
                  {/* 闪念完整内容 */}
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
                  {/* 闪念查看详情链接 */}
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

              {/* 标签：统一使用共享 PostTags（posts 表内容包含 memo） */}
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
        )}
      </div>
    </div>
  );
}
