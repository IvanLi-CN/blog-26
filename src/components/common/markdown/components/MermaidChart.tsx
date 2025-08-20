"use client";

import { useEffect, useRef, useState } from "react";
import type { MermaidChartProps } from "../types";
import { mergeClassNames } from "../utils";

/**
 * Mermaid 图表组件，支持动态渲染
 */
export function MermaidChart({ chart, className }: MermaidChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [svgContent, setSvgContent] = useState("");
  const [isClient, setIsClient] = useState(false);

  // 客户端检查 effect
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    let mounted = true;

    const renderMermaid = async () => {
      if (!chart.trim()) {
        setIsLoading(false);
        return;
      }

      // 确保在客户端环境中运行
      if (typeof window === "undefined") {
        return;
      }

      try {
        setIsLoading(true);
        setHasError(false);

        // 动态导入 mermaid
        const mermaid = await import("mermaid").then((m) => m.default);

        // 配置 mermaid
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          fontFamily: "inherit",
          fontSize: 14,
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
          },
          sequence: {
            useMaxWidth: true,
            wrap: true,
          },
          gantt: {
            useMaxWidth: true,
          },
          journey: {
            useMaxWidth: true,
          },
          pie: {
            useMaxWidth: true,
          },
        });

        // 生成唯一 ID
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 渲染图表
        const { svg } = await mermaid.render(id, chart);

        if (mounted) {
          setSvgContent(svg);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Mermaid rendering error:", error);
        if (mounted) {
          setHasError(true);
          setErrorMessage(error instanceof Error ? error.message : "Unknown error");
          setIsLoading(false);
        }
      }
    };

    renderMermaid();

    return () => {
      mounted = false;
    };
  }, [chart, isClient]);

  // 服务端渲染时显示占位符
  if (!isClient) {
    return (
      <div
        className={mergeClassNames(
          "mermaid-container bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 my-4",
          className
        )}
      >
        <div className="flex items-center justify-center text-gray-500 dark:text-gray-400">
          <span>正在加载图表...</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={mergeClassNames(
          "mermaid-container bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 my-4",
          className
        )}
      >
        <div className="flex items-center justify-center space-x-2 text-gray-500 dark:text-gray-400">
          <svg
            className="animate-spin h-5 w-5"
            role="img"
            aria-label="Loading"
            fill="none"
            viewBox="0 0 24 24"
          >
            <title>Loading</title>
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm">正在渲染 Mermaid 图表...</span>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className={mergeClassNames(
          "mermaid-error bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 my-4",
          className
        )}
      >
        <div className="flex items-start space-x-2">
          <svg
            className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            role="img"
            aria-label="Error"
          >
            <title>Error</title>
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
              Mermaid 图表渲染失败
            </h4>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            <details className="mt-2">
              <summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer hover:text-red-800 dark:hover:text-red-200">
                查看原始代码
              </summary>
              <pre className="mt-2 text-xs bg-red-100 dark:bg-red-900/40 p-2 rounded border overflow-x-auto">
                <code>{chart}</code>
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }

  // 如果有 SVG 内容，直接渲染
  if (svgContent) {
    return (
      <div
        className={mergeClassNames(
          "mermaid-container bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 my-4 overflow-x-auto",
          className
        )}
        style={{
          textAlign: "center",
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={mergeClassNames(
        "mermaid-container bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 my-4 overflow-x-auto",
        className
      )}
      style={{
        textAlign: "center",
      }}
    />
  );
}
