"use client";

import { memo, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { removeInlineTags } from "@/lib/tag-parser";
import { CodeBlock, ImageLightbox } from "./markdown/components";
import { ClientMermaidRenderer } from "./markdown/components/ClientMermaidRenderer";
// 导入自定义插件和组件
import { rehypeImageOptimization, rehypeResponsiveTables } from "./markdown/plugins";
import type { MarkdownRendererProps } from "./markdown/types";
import {
  cleanMarkdownContent,
  defaultUrlTransform,
  extractTextContent,
  getVariantConfig,
  mergeClassNames,
} from "./markdown/utils";

// 基于默认配置扩展允许的 HTML 标签，用于支持受限的原始 HTML 渲染
const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // 额外允许的语义标签
    "kbd",
    "sub",
    "sup",
    // 表格相关标签（部分数据表以原始 HTML 形式存储）
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
  ],
  attributes: {
    ...defaultSchema.attributes,
    // 允许基础表格布局属性与样式类名
    table: [...(defaultSchema.attributes?.table || []), "className"],
    thead: [...(defaultSchema.attributes?.thead || []), "className"],
    tbody: [...(defaultSchema.attributes?.tbody || []), "className"],
    tfoot: [...(defaultSchema.attributes?.tfoot || []), "className"],
    tr: [...(defaultSchema.attributes?.tr || []), "className"],
    th: [...(defaultSchema.attributes?.th || []), "className", "colspan", "rowspan"],
    td: [...(defaultSchema.attributes?.td || []), "className", "colspan", "rowspan"],
    kbd: [...(defaultSchema.attributes?.kbd || []), "className"],
    sub: [...(defaultSchema.attributes?.sub || []), "className"],
    sup: [...(defaultSchema.attributes?.sup || []), "className"],
  },
};

// 导入必要的样式
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

/**
 * Markdown 渲染器组件
 *
 * 功能特性：
 * - 支持 GitHub Flavored Markdown (GFM)
 * - 数学公式渲染 (KaTeX)
 * - 代码语法高亮
 * - 代码块折叠功能
 * - 图片灯箱效果
 * - Mermaid 图表渲染
 * - 响应式表格
 * - XSS 安全防护
 */
export const MarkdownRenderer = memo<MarkdownRendererProps>(
  ({
    content,
    className,
    variant = "article",
    enableMath,
    enableMermaid,
    enableCodeFolding,
    maxCodeLines,
    previewCodeLines,
    enableImageLightbox,
    articlePath,
    contentSource = "webdav",
    removeTags = false,
  }) => {
    // 获取变体配置
    const variantConfig = useMemo(() => getVariantConfig(variant), [variant]);

    // 合并配置选项
    const config = useMemo(
      () => ({
        enableMath: enableMath ?? variantConfig.enableMath,
        enableMermaid: enableMermaid ?? variantConfig.enableMermaid,
        enableCodeFolding: enableCodeFolding ?? variantConfig.enableCodeFolding,
        maxCodeLines: maxCodeLines ?? variantConfig.maxCodeLines,
        previewCodeLines: previewCodeLines ?? variantConfig.previewCodeLines,
        enableImageLightbox: enableImageLightbox ?? variantConfig.enableImageLightbox,
      }),
      [
        enableMath,
        enableMermaid,
        enableCodeFolding,
        maxCodeLines,
        previewCodeLines,
        enableImageLightbox,
        variantConfig,
      ]
    );

    // 处理内容
    const processedContent = useMemo(() => {
      if (!content?.trim()) return "";

      let processed = cleanMarkdownContent(content);
      if (removeTags) {
        processed = removeInlineTags(processed);
      }

      return processed;
    }, [content, removeTags]);

    // 配置 remark 插件
    const remarkPlugins = useMemo(() => {
      const plugins: unknown[] = [];

      // 数学应优先于 GFM，避免下划线、管道等在数学环境中被 GFM 误解析
      if (config.enableMath) {
        plugins.push(remarkMath);
      }

      plugins.push(remarkGfm);

      return plugins;
    }, [config.enableMath]);

    // 配置 rehype 插件
    const rehypePlugins = useMemo(() => {
      const plugins: unknown[] = [];

      // 先解析原始 HTML，再进行安全过滤，保证后续插件只在已净化的节点上工作
      plugins.push(rehypeRaw);
      plugins.push([rehypeSanitize, markdownSanitizeSchema]);

      // 响应式表格（需要在其他插件之前）
      plugins.push(rehypeResponsiveTables);

      // 图片优化
      plugins.push([
        rehypeImageOptimization,
        {
          enableLazyLoading: true,
          enableLightbox: config.enableImageLightbox,
          articlePath,
          contentSource,
        },
      ]);

      // 数学公式支持
      if (config.enableMath) {
        plugins.push([
          rehypeKatex,
          {
            strict: "ignore",
            throwOnError: false,
          },
        ]);
      }

      // 代码高亮
      plugins.push(rehypeHighlight);

      // 代码折叠：改由 React 组件 CodeBlock 负责
      // 如果同时启用 rehype 插件与组件，会出现重复按钮。
      // 因此这里不再注入 rehypeCollapsibleCode。

      return plugins;
    }, [config, articlePath, contentSource]);

    // 自定义组件映射
    const components = useMemo<Components>(
      () => ({
        // 代码块处理
        code({ children, className, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : undefined;
          const isInline = !match;

          // 内联代码
          if (isInline) {
            return (
              <code
                className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }

          // Mermaid 图表
          if (config.enableMermaid && language === "mermaid") {
            return <ClientMermaidRenderer chart={extractTextContent(children)} />;
          }

          // 普通代码块 - 保持原始 children 以保留语法高亮结构
          return (
            <CodeBlock
              language={language}
              enableFolding={config.enableCodeFolding}
              maxLines={config.maxCodeLines}
              previewLines={config.previewCodeLines}
              className={className}
              {...props}
            >
              {children}
            </CodeBlock>
          );
        },

        // 图片处理
        img({ src, alt, ...props }) {
          return (
            <ImageLightbox
              src={String(src || "")}
              alt={alt}
              enableLightbox={config.enableImageLightbox}
              {...props}
            />
          );
        },

        // 标题样式
        h1: ({ children }) => (
          <h1 className="text-3xl font-bold mt-8 mb-6 first:mt-0 text-gray-900 dark:text-gray-100">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-2xl font-semibold mt-8 mb-4 first:mt-0 text-gray-900 dark:text-gray-100">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-xl font-semibold mt-6 mb-3 first:mt-0 text-gray-900 dark:text-gray-100">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-lg font-semibold mt-6 mb-3 first:mt-0 text-gray-900 dark:text-gray-100">
            {children}
          </h4>
        ),
        h5: ({ children }) => (
          <h5 className="text-base font-semibold mt-4 mb-2 first:mt-0 text-gray-900 dark:text-gray-100">
            {children}
          </h5>
        ),
        h6: ({ children }) => (
          <h6 className="text-sm font-semibold mt-4 mb-2 first:mt-0 text-gray-900 dark:text-gray-100">
            {children}
          </h6>
        ),

        // 段落样式
        p: ({ children }) => (
          <p className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300">{children}</p>
        ),

        // 列表样式
        ul: ({ children }) => (
          <ul className="list-disc list-outside pl-6 my-4 space-y-1 text-gray-700 dark:text-gray-300">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside pl-6 my-4 space-y-1 text-gray-700 dark:text-gray-300">
            {children}
          </ol>
        ),
        li: ({ children }) => <li>{children}</li>,

        // 引用样式
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 dark:text-gray-400 my-4 bg-gray-50 dark:bg-gray-800 py-2">
            {children}
          </blockquote>
        ),

        // 链接样式
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline transition-colors duration-200"
          >
            {children}
          </a>
        ),

        // 分割线样式
        hr: () => <hr className="border-t border-gray-300 dark:border-gray-600 my-6" />,

        // 预格式化文本
        pre: ({ children, className, ...props }) => (
          <pre
            className={mergeClassNames(
              "my-4 overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-lg",
              className
            )}
            {...props}
          >
            {children}
          </pre>
        ),
      }),
      [config]
    );

    // 如果没有内容，显示占位符
    if (!processedContent.trim()) {
      return <div className="text-gray-500 italic text-center py-8">暂无内容</div>;
    }

    return (
      <div className={mergeClassNames(variantConfig.baseClassName, className)}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins as never[]}
          rehypePlugins={rehypePlugins as never[]}
          components={components}
          urlTransform={defaultUrlTransform}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    );
  }
);

MarkdownRenderer.displayName = "MarkdownRenderer";

export default MarkdownRenderer;
