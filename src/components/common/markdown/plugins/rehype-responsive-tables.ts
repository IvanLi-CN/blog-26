import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import type { ResponsiveTablesOptions } from "../types";

/**
 * Rehype 插件：响应式表格
 *
 * 此插件会将表格包装在一个可滚动的容器中，
 * 以确保在小屏幕设备上表格能够正常显示。
 */
export function rehypeResponsiveTables(options: ResponsiveTablesOptions = {}) {
  const { containerClassName = "table-responsive" } = options;

  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      // 查找 table 元素
      if (node.tagName === "table" && parent && typeof index === "number") {
        // 创建响应式容器
        const responsiveContainer: Element = {
          type: "element",
          tagName: "div",
          properties: {
            className: [
              containerClassName,
              "overflow-x-auto",
              "my-4",
              "border",
              "border-[rgba(var(--nature-border-rgb),0.72)]",
              "rounded-[1.25rem]",
              "bg-[rgba(var(--nature-surface-rgb),0.72)]",
            ],
          },
          children: [
            {
              ...node,
              properties: {
                ...node.properties,
                className: [
                  ...(Array.isArray(node.properties?.className) ? node.properties.className : []),
                  "min-w-full",
                  "divide-y",
                  "divide-[rgba(var(--nature-border-rgb),0.56)]",
                ],
              },
            },
          ],
        };

        // 替换原始的 table 元素
        parent.children[index] = responsiveContainer;
      }
    });

    // 为表格元素添加样式类
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "thead") {
        const existingClasses = Array.isArray(node.properties?.className)
          ? node.properties.className
          : node.properties?.className && typeof node.properties.className !== "boolean"
            ? [String(node.properties.className)]
            : [];

        node.properties = {
          ...node.properties,
          className: [...existingClasses, "bg-[rgba(var(--nature-highlight-rgb),0.2)]"],
        };
      }

      if (node.tagName === "th") {
        const existingClasses = Array.isArray(node.properties?.className)
          ? node.properties.className
          : node.properties?.className && typeof node.properties.className !== "boolean"
            ? [String(node.properties.className)]
            : [];

        node.properties = {
          ...node.properties,
          className: [
            ...existingClasses,
            "px-6",
            "py-3",
            "text-left",
            "text-xs",
            "font-medium",
            "text-[color:var(--nature-text-soft)]",
            "uppercase",
            "tracking-wider",
          ],
        };
      }

      if (node.tagName === "tbody") {
        const existingClasses = Array.isArray(node.properties?.className)
          ? node.properties.className
          : node.properties?.className && typeof node.properties.className !== "boolean"
            ? [String(node.properties.className)]
            : [];

        node.properties = {
          ...node.properties,
          className: [
            ...existingClasses,
            "bg-[rgba(var(--nature-surface-rgb),0.72)]",
            "divide-y",
            "divide-[rgba(var(--nature-border-rgb),0.56)]",
          ],
        };
      }

      if (node.tagName === "td") {
        const existingClasses = Array.isArray(node.properties?.className)
          ? node.properties.className
          : node.properties?.className && typeof node.properties.className !== "boolean"
            ? [String(node.properties.className)]
            : [];

        node.properties = {
          ...node.properties,
          className: [
            ...existingClasses,
            "px-6",
            "py-4",
            "whitespace-nowrap",
            "text-sm",
            "text-[color:var(--nature-text)]",
          ],
        };
      }

      if (node.tagName === "tr") {
        const existingClasses = Array.isArray(node.properties?.className)
          ? node.properties.className
          : node.properties?.className && typeof node.properties.className !== "boolean"
            ? [String(node.properties.className)]
            : [];

        node.properties = {
          ...node.properties,
          className: [
            ...existingClasses,
            "transition-colors",
            "duration-150",
            "hover:bg-[rgba(var(--nature-highlight-rgb),0.16)]",
          ],
        };
      }
    });
  };
}
