"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { extractTableOfContents, type TocItem } from "../../lib/toc";

interface TableOfContentsProps {
  content: string;
  className?: string;
}

interface TocItemComponentProps {
  item: TocItem;
  activeId: string;
  onItemClick: (id: string) => void;
}

function TocItemComponent({ item, activeId, onItemClick }: TocItemComponentProps) {
  const isActive = activeId === item.id;

  return (
    <li>
      <button
        type="button"
        onClick={() => onItemClick(item.id)}
        className={`block w-full text-left py-1 px-2 rounded text-sm transition-colors duration-200 ${
          isActive
            ? "text-primary bg-primary/10 font-medium"
            : "text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-primary/5"
        }`}
        style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
      >
        {item.title}
      </button>
      {item.children && item.children.length > 0 && (
        <ul className="mt-1">
          {item.children.map((child, index) => (
            <TocItemComponent
              key={`${child.id}-${index}`}
              item={child}
              activeId={activeId}
              onItemClick={onItemClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function TableOfContents({ content, className = "" }: TableOfContentsProps) {
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const items = extractTableOfContents(content);
    setTocItems(items);
  }, [content]);

  useEffect(() => {
    // 监听滚动，高亮当前章节
    const handleScroll = () => {
      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      const scrollTop = window.scrollY;

      let currentId = "";
      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i] as HTMLElement;
        if (heading.offsetTop <= scrollTop + 100) {
          currentId = heading.id;
          break;
        }
      }

      setActiveId(currentId);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // 初始化

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleItemClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (tocItems.length === 0) {
    return null;
  }

  return (
    <div className={`bg-base-100 border border-base-300 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-base-content flex items-center gap-2">
          <Icon icon="tabler:list" className="w-4 h-4" />
          目录
        </h3>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="btn btn-ghost btn-xs"
          aria-label={isCollapsed ? "展开目录" : "收起目录"}
        >
          <Icon
            icon={isCollapsed ? "tabler:chevron-down" : "tabler:chevron-up"}
            className="w-4 h-4"
          />
        </button>
      </div>

      {!isCollapsed && (
        <nav aria-label="文章目录">
          <ul className="space-y-1">
            {tocItems.map((item, index) => (
              <TocItemComponent
                key={`${item.id}-${index}`}
                item={item}
                activeId={activeId}
                onItemClick={handleItemClick}
              />
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
