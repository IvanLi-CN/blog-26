"use client";

import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { ContentAnomalies } from "../../lib/content-anomalies";
import Icon from "../ui/Icon";

interface AnomalyIndicatorProps {
  anomalies: ContentAnomalies;
  showLabel?: boolean;
}

export function AnomalyIndicator({ anomalies, showLabel = false }: AnomalyIndicatorProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const items: Array<{ key: string; text: string; icon: ReactElement; tone: string }> = [];

  if (anomalies?.inlineImageCount > 0) {
    items.push({
      key: "inlineImages",
      text: `包含 Base64 内嵌图片 ${anomalies.inlineImageCount} 处`,
      tone: "text-[color:var(--nature-accent-strong)]",
      icon: (
        <Icon name="tabler:photo" className="h-4 w-4 text-[color:var(--nature-accent-strong)]" />
      ),
    });
  }

  if (anomalies?.largeInlineImageCount > 0) {
    items.push({
      key: "largeInlineImages",
      text: `较大（≥50KB）的内嵌图片 ${anomalies.largeInlineImageCount} 处`,
      tone: "text-[color:var(--nature-danger)]",
      icon: (
        <Icon name="tabler:alert-triangle" className="h-4 w-4 text-[color:var(--nature-danger)]" />
      ),
    });
  }

  if (items.length === 0 && anomalies?.hasInlineDataImages) {
    items.push({
      key: "generic",
      text: "检测到异常数据：包含 Base64 内嵌图片",
      tone: "text-[color:var(--nature-danger)]",
      icon: (
        <Icon name="tabler:alert-triangle" className="h-4 w-4 text-[color:var(--nature-danger)]" />
      ),
    });
  }

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!anomalies?.hasInlineDataImages) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className="nature-chip nature-chip-warning gap-1"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Icon name="tabler:alert-triangle" className="h-3.5 w-3.5" />
        {showLabel ? (
          <span className="text-xs">异常数据</span>
        ) : (
          <span className="sr-only">异常数据</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[1.25rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.97)] p-2 shadow-[0_18px_40px_rgba(8,21,16,0.16)] backdrop-blur-xl">
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-5 text-[color:var(--nature-text-soft)]"
              >
                <span className="mt-0.5">{item.icon}</span>
                <span className={item.tone}>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AnomalyIndicator;
