"use client";

/* eslint-disable @next/next/no-img-element */

import type React from "react";
import { useCallback, useEffect, useState } from "react";
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
            "max-w-full h-auto rounded-lg border shadow-sm",
            enableLightbox &&
              !hasError &&
              "cursor-pointer hover:shadow-md transition-shadow duration-200",
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
          <div className="inline-block w-full bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500">
            <div className="block text-sm">📷 图片加载失败</div>
            <div className="block text-xs mt-1 text-gray-400">{alt}</div>
            <div className="block text-xs mt-1 font-mono text-gray-400 break-all">路径: {src}</div>
          </div>
        )}
      </span>

      {/* 灯箱遮罩 */}
      {isLightboxOpen && enableLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm"
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
            className="absolute top-4 right-4 z-10 p-2 text-white hover:text-gray-300 transition-colors duration-200"
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
          <div className="relative max-w-[90vw] max-h-[90vh] p-4">
            {/* biome-ignore lint/performance/noImgElement: Lightbox uses native img intentionally */}
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />

            {/* 图片标题 */}
            {alt && alt !== "图片" && (
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-sm p-2 rounded-b-lg">
                {alt}
              </div>
            )}
          </div>

          {/* 操作提示 */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm opacity-75">
            按 ESC 键或点击背景关闭
          </div>
        </div>
      )}
    </>
  );
}
