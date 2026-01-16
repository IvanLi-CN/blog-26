"use client";

import type React from "react";
import { useEffect, useState } from "react";
import type { CodeBlockProps } from "../types";
import { countLines, extractTextContent, mergeClassNames } from "../utils";

/**
 * 创建代码预览内容，保持语法高亮结构
 * @param children 原始 children
 * @param previewLines 预览行数
 * @returns 预览内容的 React 节点
 */
function createPreviewContent(children: React.ReactNode, previewLines: number): React.ReactNode {
  const fullText = extractTextContent(children);
  const lines = fullText.split("\n");
  const previewText = lines.slice(0, previewLines).join("\n");

  // 如果原始 children 是简单文本，直接返回预览文本
  if (typeof children === "string") {
    return previewText;
  }

  // 对于复杂结构，我们需要保持语法高亮，但截断内容
  // 这里我们使用一个简化的方法：如果预览文本长度小于原文本的一定比例，
  // 我们认为可以安全地返回原始 children（因为截断可能会破坏语法高亮结构）
  const ratio = previewText.length / fullText.length;
  if (ratio > 0.8) {
    // 如果预览内容占原内容的80%以上，直接返回原始内容
    return children;
  }

  // 否则返回纯文本预览（牺牲语法高亮以确保正确截断）
  return previewText;
}

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

  // 只在需要计算行数时提取文本内容
  const codeContent = extractTextContent(children).replace(/\n$/, "");
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

  // 创建预览内容，尽量保持语法高亮
  const previewContent = createPreviewContent(children, previewLines);

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
            className="collapsible-code-expand-btn absolute bottom-0 left-0 right-0 w-full px-3 py-2 text-xs text-base-content/60 hover:text-base-content hover:bg-base-300/50 transition-colors duration-200 flex items-center justify-center gap-1 border-t border-base-300 bg-base-200"
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
            className="collapsible-code-collapse-btn absolute bottom-0 left-0 right-0 w-full px-3 py-2 text-xs text-base-content/60 hover:text-base-content hover:bg-base-300/50 transition-colors duration-200 flex items-center justify-center gap-1 border-t border-base-300 bg-base-200"
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
