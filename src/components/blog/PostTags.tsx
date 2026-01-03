"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalizeTagPath } from "@/components/tag-icons/normalize-tag-path";
import { getTagIcons, type TagIconMap } from "@/components/tag-icons/tag-icon-client";
import Icon from "@/components/ui/Icon";
import { buildTagHref } from "@/lib/tag-href";

interface Tag {
  title: string;
  slug: string;
}

interface PostTagsProps {
  tags?: Tag[] | string[] | string;
  className?: string;
  title?: string;
  isCategory?: boolean;
  iconMap?: TagIconMap;
  iconSvgMap?: Record<string, string | null>;
}

// 默认统一为 Hash 图标（post 内容标签显示规则）

// 根据标签类型获取颜色主题
function getTagColorTheme(tagTitle: string): string {
  const lowerTitle = tagTitle.toLowerCase();

  // 硬件相关 - 蓝色主题
  if (
    lowerTitle.includes("hardware") ||
    lowerTitle.includes("circuit") ||
    lowerTitle === "stm32" ||
    lowerTitle === "usb"
  )
    return "bg-blue-100 border-blue-300 hover:bg-blue-200 hover:border-blue-400 text-blue-800";

  // 项目相关 - 绿色主题
  if (lowerTitle.includes("project") || lowerTitle === "diy")
    return "bg-green-100 border-green-300 hover:bg-green-200 hover:border-green-400 text-green-800";

  // 编程语言 - 紫色主题
  if (lowerTitle === "rust" || lowerTitle.includes("code") || lowerTitle.includes("software"))
    return "bg-purple-100 border-purple-300 hover:bg-purple-200 hover:border-purple-400 text-purple-800";

  // 电源相关 - 橙色主题
  if (lowerTitle.includes("pd-sink") || lowerTitle.includes("power") || lowerTitle.includes("ups"))
    return "bg-orange-100 border-orange-300 hover:bg-orange-200 hover:border-orange-400 text-orange-800";

  // 默认主题
  return "bg-base-200 border-base-300 hover:bg-primary/10 hover:border-primary/20";
}

export default function PostTags({
  tags,
  className = "flex gap-1 flex-wrap",
  title,
  iconMap,
  iconSvgMap,
}: PostTagsProps) {
  const [resolvedIcons, setResolvedIcons] = useState<TagIconMap>({});

  const tagArray = useMemo<Tag[]>(() => {
    if (!tags) return [];

    // 处理不同格式的标签数据
    if (typeof tags === "string") {
      // 处理逗号分隔的字符串
      return tags.split(",").map((tag) => ({
        title: tag.trim(),
        slug: tag.trim().toLowerCase().replace(/\s+/g, "-"),
      }));
    }

    if (Array.isArray(tags)) {
      // 处理数组格式
      return tags.map((tag) => {
        if (typeof tag === "string") {
          // 字符串数组
          return {
            title: tag.trim(),
            slug: tag.trim().toLowerCase().replace(/\s+/g, "-"),
          };
        }

        if (tag && typeof tag === "object" && "title" in tag) {
          // 已经是 Tag 对象格式
          return tag as Tag;
        }

        // 其他格式，转换为字符串
        const tagStr = String(tag).trim();
        return {
          title: tagStr,
          slug: tagStr.toLowerCase().replace(/\s+/g, "-"),
        };
      });
    }

    // 其他格式，尝试转换为字符串
    const tagStr = String(tags).trim();
    if (!tagStr) return [];
    return [
      {
        title: tagStr,
        slug: tagStr.toLowerCase().replace(/\s+/g, "-"),
      },
    ];
  }, [tags]);

  const normalizedTagPaths = useMemo(
    () =>
      tagArray.map((tag) => normalizeTagPath(tag.title)).filter((tagPath) => tagPath.length > 0),
    [tagArray]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (normalizedTagPaths.length === 0) {
        setResolvedIcons({});
        return;
      }

      const icons = await getTagIcons(normalizedTagPaths, iconMap);
      if (cancelled) return;
      setResolvedIcons(icons);
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedTagPaths, iconMap]);

  if (!tagArray.length) return null;

  return (
    <>
      {title !== undefined && (
        <span className="align-super font-normal underline underline-offset-4 decoration-2">
          {title}
        </span>
      )}
      <ul className={className}>
        {tagArray.map((tag) => {
          const lastSegment = tag.title.includes("/") ? tag.title.split("/").pop() : tag.title;
          const segments = tag.title.split("/");
          const isMultiLevel = segments.length > 1;
          const normalizedTagPath = normalizeTagPath(tag.title);
          const resolvedIcon =
            (normalizedTagPath ? iconMap?.[normalizedTagPath] : undefined) ??
            (normalizedTagPath ? resolvedIcons[normalizedTagPath] : undefined) ??
            null;
          const resolvedSvg =
            resolvedIcon && iconSvgMap ? (iconSvgMap[resolvedIcon] ?? null) : null;
          const hashSvg = iconSvgMap ? (iconSvgMap["tabler:hash"] ?? null) : null;
          const iconFallbackName = resolvedIcon ?? "tabler:hash";
          const iconSvg = resolvedSvg ?? hashSvg;
          const shouldRenderInlineSvg = Boolean(iconSvg);

          return (
            <li key={tag.slug} className="inline">
              <Link
                href={buildTagHref(tag.title)}
                className={`inline-flex items-center ${
                  isMultiLevel
                    ? "bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 hover:from-primary/20 hover:to-secondary/20 hover:border-primary/30"
                    : getTagColorTheme(tag.title)
                } px-2 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
              >
                <span
                  className={`flex items-center gap-1 ${isMultiLevel ? "font-semibold text-primary" : ""}`}
                >
                  <span className="hidden sm:inline-block" aria-hidden>
                    {shouldRenderInlineSvg && iconSvg ? (
                      <span
                        className="inline-flex [&>svg]:w-3 [&>svg]:h-3"
                        dangerouslySetInnerHTML={{ __html: iconSvg }}
                      />
                    ) : (
                      <Icon name={iconFallbackName} className="w-3 h-3" />
                    )}
                  </span>
                  {String(lastSegment).replace(/^#/, "")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
