"use client";

import type React from "react";
import { useEffect, useState } from "react";
import type { CodeBlockProps } from "../types";
import { countLines, mergeClassNames } from "../utils";

/**
 * 代码块组件，支持语法高亮和折叠功能
 */
export function CodeBlock({
  children,
  language,
  enableFolding = true,
  maxLines = 30,
  previewLines = 20,
  className,
  ...props
}: CodeBlockProps & React.HTMLAttributes<HTMLElement>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const codeContent = String(children).replace(/\n$/, "");
  const totalLines = countLines(codeContent);
  const shouldFold = enableFolding && totalLines > maxLines;

  // 处理代码折叠切换
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // 客户端代码折叠按钮点击处理
  useEffect(() => {
    const handleCodeToggle = (event: Event) => {
      const target = event.target as HTMLElement;
      const button = target.closest(".collapsible-code-expand-btn, .collapsible-code-collapse-btn");

      if (!button) return;

      const container = button.closest(".collapsible-code-container");
      if (!container) return;

      const preview = container.querySelector(".collapsible-code-preview");
      const full = container.querySelector(".collapsible-code-full");

      if (!preview || !full) return;

      const action = button.getAttribute("data-action");

      if (action === "expand") {
        preview.classList.add("hidden");
        full.classList.remove("hidden");
      } else if (action === "collapse") {
        preview.classList.remove("hidden");
        full.classList.add("hidden");
      }
    };

    // 添加全局事件监听器
    document.addEventListener("click", handleCodeToggle);

    return () => {
      document.removeEventListener("click", handleCodeToggle);
    };
  }, []);

  // 如果不需要折叠，直接返回普通代码块
  if (!shouldFold) {
    return (
      <code className={mergeClassNames(className, language && `language-${language}`)} {...props}>
        {children}
      </code>
    );
  }

  // 计算预览内容
  const lines = codeContent.split("\n");
  const previewContent = lines.slice(0, previewLines).join("\n");

  return (
    <div
      className="collapsible-code-container"
      data-total-lines={totalLines}
      data-preview-lines={previewLines}
    >
      {/* 预览部分 */}
      <div className={`collapsible-code-preview ${isExpanded ? "hidden" : ""}`}>
        <div className="relative">
          <code
            className={mergeClassNames(className, language && `language-${language}`)}
            {...props}
          >
            {previewContent}
          </code>
          <button
            type="button"
            className="collapsible-code-expand-btn absolute bottom-0 left-0 right-0 w-full px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center gap-1 border-t border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
            onClick={toggleExpanded}
            data-action="expand"
          >
            <svg
              className="w-3 h-3"
              role="img"
              aria-label="展开"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>展开</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
            展开全部 ({totalLines} 行)
          </button>
        </div>
      </div>

      {/* 完整内容部分 */}
      <div className={`collapsible-code-full ${!isExpanded ? "hidden" : ""}`}>
        <div className="relative">
          <code
            className={mergeClassNames(className, language && `language-${language}`)}
            {...props}
          >
            {children}
          </code>
          <button
            type="button"
            className="collapsible-code-collapse-btn absolute bottom-0 left-0 right-0 w-full px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center gap-1 border-t border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
            onClick={toggleExpanded}
            data-action="collapse"
          >
            <svg
              className="w-3 h-3"
              role="img"
              aria-label="收起"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>收起</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 15l7-7 7 7"
              />
            </svg>
            收起
          </button>
        </div>
      </div>
    </div>
  );
}
