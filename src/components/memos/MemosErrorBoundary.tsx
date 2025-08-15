"use client";

/**
 * Memos 错误边界组件
 * 
 * 用于捕获和处理 Memos 相关组件的错误，提供友好的错误提示
 */

import { Component, ErrorInfo, ReactNode } from "react";

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
    console.error('Memos Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI - 匹配 DaisyUI 样式
      return (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <div className="text-error mb-4">
              <svg
                className="w-16 h-16 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            
            <h2 className="card-title justify-center text-error">
              Oops! 出现了一些问题
            </h2>
            
            <p className="text-base-content/70 mb-4">
              加载 Memos 时遇到了错误，请尝试刷新页面。
            </p>
            
            <div className="card-actions justify-center">
              <button
                onClick={() => window.location.reload()}
                className="btn btn-primary"
              >
                刷新页面
              </button>
              
              <button
                onClick={() => this.setState({ hasError: false })}
                className="btn btn-ghost"
              >
                重试
              </button>
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-base-content/60">
                  错误详情 (开发模式)
                </summary>
                <pre className="text-xs mt-2 p-2 bg-base-200 rounded overflow-auto">
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
