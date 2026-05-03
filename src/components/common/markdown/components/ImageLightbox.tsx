"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageLightboxProps } from "../types";
import { mergeClassNames } from "../utils";

/**
 * 图片灯箱组件，支持点击放大查看
 */
export function ImageLightbox({
  src,
  alt = "图片",
  className,
  enableLightbox = true,
  ...props
}: ImageLightboxProps & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [_isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // 打开灯箱
  const openLightbox = useCallback(() => {
    if (enableLightbox && !hasError) {
      setIsLightboxOpen(true);
      // 防止背景滚动
      document.body.style.overflow = "hidden";
    }
  }, [enableLightbox, hasError]);

  // 关闭灯箱
  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
    // 恢复背景滚动
    document.body.style.overflow = "";
  }, []);

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isLightboxOpen) {
        closeLightbox();
      }
    };

    if (isLightboxOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen, closeLightbox]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // 处理图片加载完成
  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  // 处理图片加载错误
  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // 处理灯箱背景点击
  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      closeLightbox();
    }
  };

  return (
    <>
      {/* 主图片 */}
      <span className="inline-block my-4 w-full">
        {/* biome-ignore lint/performance/noImgElement: This lightbox uses native <img> for simplicity and performance */}
        <img
          src={src}
          alt={alt}
          className={mergeClassNames(
            "h-auto max-w-full rounded-[1.25rem] border border-[rgba(var(--nature-border-rgb),0.72)] shadow-[0_12px_24px_rgba(8,21,16,0.08)]",
            enableLightbox &&
              !hasError &&
              "cursor-pointer transition-shadow duration-200 hover:shadow-[0_18px_34px_rgba(8,21,16,0.14)]",
            className
          )}
          loading="lazy"
          onClick={openLightbox}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openLightbox();
          }}
          role={enableLightbox && !hasError ? "button" : undefined}
          tabIndex={enableLightbox && !hasError ? 0 : undefined}
          onLoad={handleImageLoad}
          onError={handleImageError}
          data-lightbox={enableLightbox ? "true" : "false"}
          data-original-src={src}
          {...props}
        />

        {/* 错误状态显示 */}
        {hasError && (
          <div className="inline-block w-full rounded-[1.25rem] border border-dashed border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-highlight-rgb),0.22)] p-4 text-center text-[color:var(--nature-text-soft)]">
            <div className="block text-sm">📷 图片加载失败</div>
            <div className="mt-1 block text-xs text-[color:var(--nature-text-faint)]">{alt}</div>
            <div className="mt-1 block break-all font-mono text-xs text-[color:var(--nature-text-faint)]">
              路径: {src}
            </div>
          </div>
        )}
      </span>

      {/* 灯箱遮罩 */}
      {isLightboxOpen &&
        enableLightbox &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="nature-modal z-50"
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === "Escape") closeLightbox();
            }}
          >
            {/* 关闭按钮 */}
            <button
              type="button"
              className="nature-icon-button absolute right-4 top-4 z-10 inline-flex text-white hover:text-white"
              onClick={closeLightbox}
              aria-label="关闭图片预览"
            >
              <svg
                className="w-6 h-6"
                role="img"
                aria-label="关闭"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>关闭</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* 放大的图片 */}
            <button
              type="button"
              className="nature-modal-backdrop"
              aria-label="关闭图片预览"
              onClick={closeLightbox}
            />
            <div className="relative z-10 max-h-[90vh] max-w-[90vw] p-4">
              {/* biome-ignore lint/performance/noImgElement: Lightbox uses native img intentionally */}
              <img
                src={src}
                alt={alt}
                className="max-h-full max-w-full rounded-[1.4rem] object-contain shadow-2xl"
              />

              {/* 图片标题 */}
              {alt && alt !== "图片" && (
                <div className="absolute bottom-0 left-0 right-0 rounded-b-[1.4rem] bg-[rgba(7,10,9,0.55)] p-2 text-sm text-white">
                  {alt}
                </div>
              )}
            </div>

            {/* 操作提示 */}
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 transform text-sm text-white/75">
              按 ESC 键或点击背景关闭
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
