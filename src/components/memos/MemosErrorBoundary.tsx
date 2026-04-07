"use client";

/**
 * Memos 错误边界组件
 *
 * 用于捕获和处理 Memos 相关组件的错误，提供友好的错误提示
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class MemosErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Memos Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="nature-panel text-center">
          <div className="px-5 py-6">
            <div className="mb-4 text-[color:var(--nature-danger)]">
              <svg
                className="w-16 h-16 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Error"
              >
                <title>Error</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>

            <h2 className="justify-center font-heading text-2xl font-semibold text-[color:var(--nature-danger)]">
              Oops! 出现了一些问题
            </h2>

            <p className="mb-4 text-[color:var(--nature-text-soft)]">
              加载 Memos 时遇到了错误，请尝试刷新页面。
            </p>

            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="nature-button nature-button-primary"
              >
                刷新页面
              </button>

              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="nature-button nature-button-ghost"
              >
                重试
              </button>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-[color:var(--nature-text-soft)]">
                  错误详情 (开发模式)
                </summary>
                <pre className="mt-2 overflow-auto rounded-xl bg-[rgba(var(--nature-highlight-rgb),0.18)] p-2 text-xs">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
