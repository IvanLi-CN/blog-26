import { Hash } from "lucide-react";
import Link from "next/link";

interface Tag {
  title: string;
  slug: string;
}

interface PostTagsProps {
  tags?: Tag[] | string[] | string;
  className?: string;
  title?: string;
  isCategory?: boolean;
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
}: PostTagsProps) {
  if (!tags) return null;

  // 处理不同格式的标签数据
  let tagArray: Tag[] = [];
  if (typeof tags === "string") {
    // 处理逗号分隔的字符串
    tagArray = tags.split(",").map((tag) => ({
      title: tag.trim(),
      slug: tag.trim().toLowerCase().replace(/\s+/g, "-"),
    }));
  } else if (Array.isArray(tags)) {
    // 处理数组格式
    tagArray = tags.map((tag) => {
      if (typeof tag === "string") {
        // 字符串数组
        return {
          title: tag.trim(),
          slug: tag.trim().toLowerCase().replace(/\s+/g, "-"),
        };
      } else if (tag && typeof tag === "object" && "title" in tag) {
        // 已经是 Tag 对象格式
        return tag as Tag;
      } else {
        // 其他格式，转换为字符串
        const tagStr = String(tag).trim();
        return {
          title: tagStr,
          slug: tagStr.toLowerCase().replace(/\s+/g, "-"),
        };
      }
    });
  } else {
    // 其他格式，尝试转换为字符串
    const tagStr = String(tags).trim();
    if (tagStr) {
      tagArray = [
        {
          title: tagStr,
          slug: tagStr.toLowerCase().replace(/\s+/g, "-"),
        },
      ];
    }
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
        {tagArray.map((tag) => {
          const lastSegment = tag.title.includes("/") ? tag.title.split("/").pop() : tag.title;
          const segments = tag.title.split("/");
          const isMultiLevel = segments.length > 1;

          return (
            <li key={tag.slug} className="inline">
              <Link
                href={`/tag/${tag.slug}`}
                className={`inline-flex items-center ${
                  isMultiLevel
                    ? "bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 hover:from-primary/20 hover:to-secondary/20 hover:border-primary/30"
                    : getTagColorTheme(tag.title)
                } px-2 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
              >
                <span
                  className={`flex items-center gap-1 ${isMultiLevel ? "font-semibold text-primary" : ""}`}
                >
                  <Hash className="inline-block sm:hidden md:inline-block w-3 h-3" aria-hidden />
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
