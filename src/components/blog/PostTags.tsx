import { Icon } from '@iconify/react';
import Link from 'next/link';

interface Tag {
  title: string;
  slug: string;
}

interface PostTagsProps {
  tags?: Tag[] | string;
  className?: string;
  title?: string;
  isCategory?: boolean;
}

// 根据标签类型获取图标
function getTagIcon(tagTitle: string): string {
  const lowerTitle = tagTitle.toLowerCase();

  // 技术类标签
  if (lowerTitle.includes("hardware") || lowerTitle.includes("circuit"))
    return "tabler:cpu";
  if (lowerTitle.includes("project") || lowerTitle.includes("ups"))
    return "tabler:rocket";
  if (lowerTitle.includes("software") || lowerTitle.includes("code"))
    return "tabler:code";
  if (lowerTitle.includes("web") || lowerTitle.includes("frontend"))
    return "tabler:world-www";
  if (lowerTitle.includes("backend") || lowerTitle.includes("server"))
    return "tabler:server";
  if (lowerTitle.includes("database") || lowerTitle.includes("db"))
    return "tabler:database";
  if (lowerTitle.includes("ai") || lowerTitle.includes("ml"))
    return "tabler:brain";
  if (lowerTitle.includes("design") || lowerTitle.includes("ui"))
    return "tabler:palette";
  if (lowerTitle.includes("tool") || lowerTitle.includes("utility"))
    return "tabler:tool";

  // 特定技术标签
  if (lowerTitle === "diy") return "tabler:hammer";
  if (lowerTitle === "stm32") return "tabler:cpu-2";
  if (lowerTitle === "usb") return "tabler:usb";
  if (lowerTitle === "rust") return "tabler:brand-rust";
  if (lowerTitle.includes("pd-sink") || lowerTitle.includes("power"))
    return "tabler:plug";

  // 默认图标
  return "tabler:tag";
}

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
  if (
    lowerTitle === "rust" ||
    lowerTitle.includes("code") ||
    lowerTitle.includes("software")
  )
    return "bg-purple-100 border-purple-300 hover:bg-purple-200 hover:border-purple-400 text-purple-800";

  // 电源相关 - 橙色主题
  if (
    lowerTitle.includes("pd-sink") ||
    lowerTitle.includes("power") ||
    lowerTitle.includes("ups")
  )
    return "bg-orange-100 border-orange-300 hover:bg-orange-200 hover:border-orange-400 text-orange-800";

  // 默认主题
  return "bg-base-200 border-base-300 hover:bg-primary/10 hover:border-primary/20";
}

export default function PostTags({ 
  tags, 
  className = "flex gap-1 flex-wrap", 
  title, 
  isCategory = false 
}: PostTagsProps) {
  if (!tags) return null;

  // 处理字符串格式的标签（逗号分隔）
  let tagArray: Tag[] = [];
  if (typeof tags === 'string') {
    tagArray = tags.split(',').map(tag => ({
      title: tag.trim(),
      slug: tag.trim().toLowerCase().replace(/\s+/g, '-')
    }));
  } else {
    tagArray = tags;
  }

  if (!tagArray.length) return null;

  return (
    <>
      {title !== undefined && (
        <span className="align-super font-normal underline underline-offset-4 decoration-2">
          {title}
        </span>
      )}
      <ul className={className}>
        {tagArray.map((tag, index) => {
          const lastSegment = tag.title.includes("/")
            ? tag.title.split("/").pop()
            : tag.title;
          const segments = tag.title.split("/");
          const isMultiLevel = segments.length > 1;

          return (
            <li key={index} className="inline">
              <Link
                href={`/tag/${tag.slug}`}
                className={`inline-flex items-center ${
                  isMultiLevel 
                    ? "bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 hover:from-primary/20 hover:to-secondary/20 hover:border-primary/30" 
                    : getTagColorTheme(tag.title)
                } px-2 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
              >
                <span className={`flex items-center gap-1 ${isMultiLevel ? "font-semibold text-primary" : ""}`}>
                  <Icon icon={getTagIcon(tag.title)} className="w-3 h-3" />
                  {lastSegment}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
