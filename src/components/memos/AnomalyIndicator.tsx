"use client";

import { useEffect, useRef, useState } from "react";
import type { ContentAnomalies } from "../../lib/content-anomalies";

interface AnomalyIndicatorProps {
  anomalies: ContentAnomalies;
  /** 是否在徽章上显示“异常数据”文字（默认仅显示图标） */
  showLabel?: boolean;
}

/**
 * 管理员异常数据指示器
 * - 以迷你列表展示多条提示，并带有图标
 * - 使用 dropdown 容器，限制宽度，避免溢出卡片
 */
export function AnomalyIndicator({ anomalies, showLabel = false }: AnomalyIndicatorProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);

  const items: Array<{ key: string; text: string; icon: JSX.Element; color: string }> = [];

  if (anomalies?.inlineImageCount > 0) {
    items.push({
      key: "inlineImages",
      text: `包含 Base64 内嵌图片 ${anomalies.inlineImageCount} 处`,
      color: "text-warning",
      icon: (
        <svg
          className="w-4 h-4 text-warning"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <title>Inline images</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14M3 7a2 2 0 012-2h14m0 0a2 2 0 012 2v6m-2-8v8M7 7v10m4-10v10"
          />
        </svg>
      ),
    });
  }

  if (anomalies?.largeInlineImageCount > 0) {
    items.push({
      key: "largeInlineImages",
      text: `较大（≥50KB）的内嵌图片 ${anomalies.largeInlineImageCount} 处`,
      color: "text-error",
      icon: (
        <svg
          className="w-4 h-4 text-error"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <title>Large inline images</title>
          <path
            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    });
  }

  // 兜底：如果无 details 但 hasInlineDataImages 为 true
  if (items.length === 0) {
    items.push({
      key: "generic",
      text: "检测到异常数据：包含 base64 内嵌图片",
      color: "text-warning",
      icon: (
        <svg
          className="w-4 h-4 text-warning"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <title>Warning</title>
          <path
            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    });
  }

  // 动态计算浮窗宽度：基于内容宽度 + 屏幕宽度进行自适应
  useEffect(() => {
    if (!open) return;
    const computeWidth = () => {
      const el = menuRef.current;
      if (!el) return;
      // 视口最大可用宽度（左右各留 16px 安全间距）
      const viewport = typeof window !== "undefined" ? window.innerWidth : 1024;
      const safeMargin = 16;
      const maxPx = Math.max(240, viewport - safeMargin * 2); // 不超过屏幕
      const minPx = Math.min(360, maxPx); // 至少 360，但不超过 max

      // 先让内容自由展开后测量
      const prevWidth = el.style.width;
      const prevMaxWidth = el.style.maxWidth;
      el.style.width = "auto";
      el.style.maxWidth = `${maxPx}px`;

      // 使用 scrollWidth 估算内容理想宽度
      const desired = Math.ceil(el.scrollWidth + 16); // 额外留 16px 内边距余量
      const finalWidth = Math.min(Math.max(desired, minPx), maxPx);
      setMenuWidth(finalWidth);

      // 还原（仅用于测量期间的样式临时修改）
      el.style.width = prevWidth;
      el.style.maxWidth = prevMaxWidth;
    };

    // 下一帧执行，确保元素已渲染
    const raf = requestAnimationFrame(computeWidth);
    window.addEventListener("resize", computeWidth);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", computeWidth);
    };
  }, [open]);

  // 若无异常，组件不渲染任何内容（保持所有 Hook 在 return 之前调用，遵循规则）
  if (!anomalies?.hasInlineDataImages) return null;

  return (
    <div
      ref={wrapperRef}
      className="dropdown dropdown-end"
      role="menu"
      tabIndex={0}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="badge badge-outline badge-xs sm:badge-sm h-6 sm:h-7 gap-1 text-warning border-warning/40 bg-warning/5"
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg
          className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-warning"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <title>异常数据</title>
          <path
            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {showLabel ? (
          <span className="text-xs">异常数据</span>
        ) : (
          // 极简款：隐藏文字，仅保留图标（保留可访问性）
          <span className="sr-only">异常数据</span>
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          className="dropdown-content z-[60] rounded-xl border border-base-300 bg-base-100/95 backdrop-blur shadow-xl p-2 mt-2 right-0 whitespace-normal break-words max-h-[min(60vh,24rem)] overflow-auto"
          role="menu"
          style={menuWidth ? { width: `${menuWidth}px` } : undefined}
        >
          <ul className="space-y-1">
            {items.map((it) => (
              <li
                key={it.key}
                className="flex items-start gap-2 text-xs leading-5 px-2 py-1 rounded hover:bg-base-200/70"
              >
                <span className="mt-0.5">{it.icon}</span>
                <span className={`text-base-content/90 ${it.color}`}>{it.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AnomalyIndicator;
