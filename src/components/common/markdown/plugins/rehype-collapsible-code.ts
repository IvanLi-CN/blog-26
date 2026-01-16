import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import type { CollapsibleCodeOptions } from "../types";

/**
 * Rehype 插件：为长代码块添加折叠功能
 *
 * 此插件会自动检测超过指定行数的代码块，并为其添加折叠功能。
 * 折叠后会显示前 N 行作为预览，并提供展开/收起按钮。
 */
export function rehypeCollapsibleCode(options: CollapsibleCodeOptions = {}) {
  const { maxLines = 30, previewLines = 20 } = options;

  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      // 查找 pre > code 结构
      if (
        node.tagName === "pre" &&
        node.children &&
        node.children.length > 0 &&
        node.children[0].type === "element" &&
        node.children[0].tagName === "code"
      ) {
        const codeElement = node.children[0] as Element;

        // 提取代码文本内容
        const codeText = extractTextContent(codeElement);

        if (!codeText) return;

        // 计算行数
        const lines = codeText.split("\n");
        const totalLines = lines.length;

        // 如果行数超过最大行数，则添加折叠功能
        if (totalLines > maxLines) {
          // 创建预览内容（前 previewLines 行）
          const previewContent = lines.slice(0, previewLines).join("\n");

          // 创建新的代码结构
          const newPreElement: Element = {
            type: "element",
            tagName: "div",
            properties: {
              className: ["collapsible-code-container"],
              "data-total-lines": totalLines,
              "data-preview-lines": previewLines,
            },
            children: [
              // 预览部分
              {
                type: "element",
                tagName: "div",
                properties: {
                  className: ["collapsible-code-preview"],
                },
                children: [
                  {
                    type: "element",
                    tagName: "pre",
                    properties: {
                      ...node.properties,
                      className: [
                        ...(Array.isArray(node.properties?.className)
                          ? node.properties.className
                          : []),
                        "relative",
                        "pb-10",
                      ],
                    },
                    children: [
                      {
                        type: "element",
                        tagName: "code",
                        properties: codeElement.properties,
                        children: [
                          {
                            type: "text",
                            value: previewContent,
                          },
                        ],
                      },
                      // 展开按钮
                      {
                        type: "element",
                        tagName: "button",
                        properties: {
                          className: [
                            "collapsible-code-expand-btn",
                            "absolute",
                            "bottom-0",
                            "left-0",
                            "right-0",
                            "w-full",
                            "px-3",
                            "py-2",
                            "text-xs",
                            "text-base-content/60",
                            "hover:text-base-content",
                            "hover:bg-base-300/50",
                            "transition-colors",
                            "duration-200",
                            "flex",
                            "items-center",
                            "justify-center",
                            "gap-1",
                            "border-t",
                            "border-base-300",
                            "bg-base-200",
                          ],
                          "data-action": "expand",
                          type: "button",
                        },
                        children: [
                          {
                            type: "element",
                            tagName: "svg",
                            properties: {
                              className: ["w-3", "h-3"],
                              fill: "none",
                              stroke: "currentColor",
                              viewBox: "0 0 24 24",
                            },
                            children: [
                              {
                                type: "element",
                                tagName: "path",
                                properties: {
                                  strokeLinecap: "round",
                                  strokeLinejoin: "round",
                                  strokeWidth: "2",
                                  d: "M19 9l-7 7-7-7",
                                },
                                children: [],
                              },
                            ],
                          },
                          {
                            type: "text",
                            value: `展开全部 (${totalLines} 行)`,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              // 完整内容部分（默认隐藏）
              {
                type: "element",
                tagName: "div",
                properties: {
                  className: ["collapsible-code-full", "hidden"],
                },
                children: [
                  {
                    type: "element",
                    tagName: "pre",
                    properties: {
                      ...node.properties,
                      className: [
                        ...(Array.isArray(node.properties?.className)
                          ? node.properties.className
                          : []),
                        "relative",
                        "pb-10",
                      ],
                    },
                    children: [
                      {
                        type: "element",
                        tagName: "code",
                        properties: codeElement.properties,
                        children: [
                          {
                            type: "text",
                            value: codeText,
                          },
                        ],
                      },
                      // 收起按钮
                      {
                        type: "element",
                        tagName: "button",
                        properties: {
                          className: [
                            "collapsible-code-collapse-btn",
                            "absolute",
                            "bottom-0",
                            "left-0",
                            "right-0",
                            "w-full",
                            "px-3",
                            "py-2",
                            "text-xs",
                            "text-base-content/60",
                            "hover:text-base-content",
                            "hover:bg-base-300/50",
                            "transition-colors",
                            "duration-200",
                            "flex",
                            "items-center",
                            "justify-center",
                            "gap-1",
                            "border-t",
                            "border-base-300",
                            "bg-base-200",
                          ],
                          "data-action": "collapse",
                          type: "button",
                        },
                        children: [
                          {
                            type: "element",
                            tagName: "svg",
                            properties: {
                              className: ["w-3", "h-3"],
                              fill: "none",
                              stroke: "currentColor",
                              viewBox: "0 0 24 24",
                            },
                            children: [
                              {
                                type: "element",
                                tagName: "path",
                                properties: {
                                  strokeLinecap: "round",
                                  strokeLinejoin: "round",
                                  strokeWidth: "2",
                                  d: "M5 15l7-7 7 7",
                                },
                                children: [],
                              },
                            ],
                          },
                          {
                            type: "text",
                            value: "收起",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          };

          // 替换原始的 pre 元素
          if (parent && typeof index === "number") {
            parent.children[index] = newPreElement;
          }
        }
      }
    });
  };
}

/**
 * 递归提取元素的纯文本内容
 */
function extractTextContent(element: Element): string {
  let text = "";

  for (const child of element.children) {
    if (child.type === "text") {
      text += child.value;
    } else if (child.type === "element") {
      text += extractTextContent(child);
    }
  }

  return text;
}
