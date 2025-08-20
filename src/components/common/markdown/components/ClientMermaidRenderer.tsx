"use client";

import { useEffect, useRef, useState } from "react";

interface ClientMermaidRendererProps {
  chart: string;
  className?: string;
}

export function ClientMermaidRenderer({ chart, className }: ClientMermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isClient, setIsClient] = useState(false);

  // 客户端检查 effect
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !chart.trim()) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const renderMermaid = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        // 动态导入 mermaid，确保只在客户端运行
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
          },
          gantt: {
            useMaxWidth: true,
          },
        });

        if (!mounted || !containerRef.current) return;

        // 生成唯一 ID
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 渲染图表
        const { svg } = await mermaid.render(id, chart);

        if (!mounted || !containerRef.current) return;

        // 插入 SVG
        containerRef.current.innerHTML = svg;

        // 添加样式
        const svgElement = containerRef.current.querySelector("svg");
        if (svgElement) {
          svgElement.style.maxWidth = "100%";
          svgElement.style.height = "auto";
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Mermaid rendering error:", error);
        if (mounted) {
          setHasError(true);
          setErrorMessage(error instanceof Error ? error.message : "未知错误");
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
        className={`mermaid-container bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 my-4 ${className || ""}`}
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
        className={`mermaid-container bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 my-4 ${className || ""}`}
      >
        <div className="flex items-center justify-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-2"></div>
          <span>正在渲染图表...</span>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className={`mermaid-container bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 my-4 ${className || ""}`}
      >
        <div className="text-red-600 dark:text-red-400">
          <h4 className="font-semibold mb-2">Mermaid 图表渲染失败</h4>
          <p className="text-sm mb-3">{errorMessage}</p>
          <details className="text-xs">
            <summary className="cursor-pointer hover:text-red-700 dark:hover:text-red-300">
              查看原始代码
            </summary>
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto">
              <code>{chart}</code>
            </pre>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-container bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 my-4 overflow-auto ${className || ""}`}
    />
  );
}
