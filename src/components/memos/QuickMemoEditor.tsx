"use client";

/**
 * 快速 Memo 编辑器组件
 *
 * 完全匹配旧项目 (Astro) 的 QuickMemoEditor 样式和功能
 *
 * 主要特点：
 * - 使用 DaisyUI 卡片样式
 * - 闪电图标 + "快速发布 Memo" 标题
 * - 使用 UniversalEditor 支持富文本编辑
 * - 支持 ⌘+Enter / Ctrl+Enter 快捷键发布
 * - 公开/私有状态切换
 * - 字符计数显示
 * - 完整的表单验证和提交逻辑
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { processInlineImagesCompat } from "@/lib/image-processing";
import {
  getMemoAssetsDir,
  getMemoDraftPath,
  getMemoEditorContentSource,
  resolveClientMemoRootPath,
} from "@/lib/memo-paths";
import { cn } from "../../lib/utils";
import { MilkdownEditor, type MilkdownEditorRef } from "./MilkdownEditor";

export interface QuickMemoData {
  content: string;
  isPublic: boolean;
  tags: string[];
}

export interface QuickMemoEditorProps {
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
  onSave?: (data: QuickMemoData) => Promise<void>;
  className?: string;
  showAdvancedOptions?: boolean;
  localSourceEnabled?: boolean;
  localMemoRootPath?: string;
}

export function QuickMemoEditor({
  placeholder = "写下你的想法...",
  minHeight = 120,
  maxHeight = 600,
  onSave,
  className,
  localSourceEnabled = true,
  localMemoRootPath,
}: QuickMemoEditorProps) {
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const clientMemoRoot = resolveClientMemoRootPath({
    localSourceEnabled,
    memoRoot: localMemoRootPath,
  });
  const memoContentSource = getMemoEditorContentSource(localSourceEnabled);
  const editorRef = useRef<MilkdownEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [hasEditorContent, setHasEditorContent] = useState(false);

  const isMac =
    typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutKey = isMac ? "⌘" : "Ctrl";

  // 重置编辑器高度的函数
  const resetEditorHeight = useCallback(() => {
    if (containerRef.current) {
      // 强制重新计算编辑器高度
      const editorContainer = containerRef.current;
      const milkdownEditor = editorContainer.querySelector(".milkdown-editor") as HTMLElement;
      const proseMirror = editorContainer.querySelector(".ProseMirror") as HTMLElement;

      if (milkdownEditor) {
        // 临时设置固定高度，然后恢复自动高度
        milkdownEditor.style.height = `${minHeight}px`;
        setTimeout(() => {
          milkdownEditor.style.height = "auto";
        }, 10);
      }

      if (proseMirror) {
        proseMirror.style.height = "auto";
      }
    }
  }, [minHeight]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const hasAnyContent = content.trim().length > 0 || hasEditorContent;
      if (!hasAnyContent || isSaving) return;

      setIsSaving(true);
      try {
        // 处理内联图片转换
        // 优先从编辑器实例读取最新 Markdown，避免 setState 未及时同步导致内容丢失
        let processedContent = content.trim();
        if (editorRef.current) {
          try {
            const latest = editorRef.current.getMarkdown();
            if (latest && latest.trim().length >= processedContent.length) {
              processedContent = latest.trim();
            }
          } catch {
            // ignore: getMarkdown may not be available during early mount
          }
        }
        // removed verbose editor debug logs

        // 兜底：Milkdown 的内容更新是异步的；当 state/ref 还没跟上但按钮已可点时，
        // 避免提交空内容（会导致 memos.create 400）。
        if (!processedContent && hasEditorContent && containerRef.current) {
          const prose = containerRef.current.querySelector(".ProseMirror") as HTMLElement | null;
          const text = (prose?.textContent || "").trim();
          if (text) {
            processedContent = text;
          }
        }

        if (editorRef.current) {
          // removed verbose editor debug logs
          processedContent = await editorRef.current.processInlineImages(processedContent);
          // removed verbose editor debug logs
        }

        processedContent = await processInlineImagesCompat(
          processedContent,
          memoContentSource,
          getMemoDraftPath(clientMemoRoot),
          "relative"
        );

        // 兜底：如仍包含 data:image，则在此处直接完成一次内联上传与替换，确保 e2e 可观察到上传请求
        if (processedContent.includes("data:image")) {
          const base64ImageRegex =
            /!\[([^\]]*)\]\s*\(\s*data:image\/([^;]+);base64,([A-Za-z0-9+/=\r\n]+)\s*\)/g;
          const matches = Array.from(processedContent.matchAll(base64ImageRegex));
          for (const match of matches) {
            const [fullMatch, altText, imageType, base64Data] = match;
            try {
              const normalizedBase64 = base64Data.replace(/\s+/g, "");
              const byteCharacters = atob(normalizedBase64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++)
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: `image/${imageType}` });
              const timestamp = Date.now();
              const filename = `inline-${timestamp}.${imageType}`;
              const file = new File([blob], filename, { type: `image/${imageType}` });

              const uploadPath = `${getMemoAssetsDir(clientMemoRoot)}/${filename}`;
              const formData = new FormData();
              formData.append("file", file);
              const resp = await fetch(`/api/files/${memoContentSource}/${uploadPath}`, {
                method: "POST",
                body: formData,
              });
              if (resp.ok) {
                processedContent = processedContent.replace(
                  fullMatch,
                  `![${altText}](./assets/${filename})`
                );
              }
            } catch (_e) {
              // swallow inline upload fallback error silently in production
            }
          }
        }

        await onSave?.({
          content: processedContent,
          isPublic,
          tags: [],
        });

        setContent("");
        setIsPublic(true);

        // 重置编辑器高度
        setTimeout(() => {
          resetEditorHeight();
        }, 100);

        // 显示成功提示（可选）
        // 这里可以添加 toast 通知
      } catch (error) {
        console.error("保存快速 memo 失败:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [
      content,
      isPublic,
      onSave,
      resetEditorHeight,
      isSaving,
      hasEditorContent,
      clientMemoRoot,
      memoContentSource,
    ]
  );

  // 处理键盘快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // 监听编辑区 DOM，及时更新是否有内容，用于按钮可用态
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const prose = container.querySelector(".ProseMirror") as HTMLElement | null;
      const text = (prose?.textContent || "").trim();
      setHasEditorContent(text.length > 0);
    };
    container.addEventListener("input", update, true);
    container.addEventListener("keyup", update, true);
    // 初始化一次
    update();
    return () => {
      container.removeEventListener("input", update, true);
      container.removeEventListener("keyup", update, true);
    };
  }, []);

  return (
    <section
      className={cn("mb-6 sm:mb-8", className)}
      data-testid="quick-memo-editor"
      onKeyDown={handleKeyDown}
      aria-label="快速发布区域"
    >
      <div className="nature-panel overflow-hidden">
        <div className="p-4 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[color:var(--nature-text)] sm:text-xl">
            <svg
              className="h-5 w-5 text-[color:var(--nature-accent-strong)] sm:h-6 sm:w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              role="img"
              aria-label="闪电图标"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            快速发布 Memo
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <div
                ref={containerRef}
                className="overflow-hidden rounded-[1.5rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.8)]"
                style={{
                  minHeight: `${minHeight}px`,
                  maxHeight: `${maxHeight}px`,
                  overflow: "auto",
                }}
              >
                <MilkdownEditor
                  ref={editorRef}
                  content={content}
                  onChange={setContent}
                  placeholder={placeholder}
                  articlePath={getMemoDraftPath(clientMemoRoot)}
                  contentSource={memoContentSource}
                  editorId="quick-memo-editor"
                  className="min-h-full"
                />
              </div>

              <div
                className="flex items-center justify-between px-1 text-xs text-[color:var(--nature-text-soft)]"
                id={helpId}
              >
                <span>{content.length} 字符</span>
                <span>{shortcutKey}+Enter 发布</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label
                  className={cn(
                    "flex items-center gap-3",
                    isSaving ? "cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  <span className="relative inline-flex h-[1.7rem] w-[3.1rem] flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="nature-switch-input peer absolute inset-0 m-0 cursor-inherit opacity-0"
                      disabled={isSaving}
                    />
                    <span
                      className="nature-switch pointer-events-none"
                      data-state={isPublic ? "checked" : "unchecked"}
                      aria-disabled={isSaving ? "true" : "false"}
                    />
                  </span>
                  <span className="text-sm">
                    {isPublic ? (
                      <span className="flex items-center space-x-1 text-[color:var(--nature-accent-strong)]">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          role="img"
                          aria-label="公开图标"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>公开发布</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-[color:var(--nature-text-soft)]">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          role="img"
                          aria-label="私有图标"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        <span>私有保存</span>
                      </span>
                    )}
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!(content.trim().length > 0 || hasEditorContent) || isSaving}
                className="nature-button nature-button-primary min-h-10 gap-2 px-4 py-2 text-sm"
                aria-label={isSaving ? "正在发布 Memo..." : "发布 Memo"}
                aria-describedby={helpId}
              >
                {isSaving ? (
                  <span className="nature-spinner h-4 w-4" />
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label="发送图标"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
                {isSaving ? "发布中..." : "发布 Memo"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
