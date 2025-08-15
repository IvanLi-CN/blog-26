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

import { useCallback, useId, useRef, useState } from "react";
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
}

export function QuickMemoEditor({
  placeholder = "写下你的想法...",
  minHeight = 120,
  maxHeight = 600,
  onSave,
  className,
}: QuickMemoEditorProps) {
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<MilkdownEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const helpId = useId();

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
      if (!content.trim() || isSaving) return;

      setIsSaving(true);
      try {
        // 处理内联图片转换
        let processedContent = content.trim();
        console.log("🔍 [QuickMemoEditor] 原始内容:", {
          content: processedContent,
          length: processedContent.length,
          hasBase64: processedContent.includes("data:image"),
          hasEscapedMarkdown: processedContent.includes("\\[") || processedContent.includes("\\]"),
        });

        if (editorRef.current) {
          console.log("🖼️ [QuickMemoEditor] 开始处理内联图片...");
          processedContent = await editorRef.current.processInlineImages(processedContent);
          console.log("✅ [QuickMemoEditor] 内联图片处理完成");
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

        // 显示错误提示（可选）
        // 这里可以添加 toast 通知
        alert("发布失败，请重试");
      } finally {
        setIsSaving(false);
      }
    },
    [content, isPublic, onSave, resetEditorHeight, isSaving]
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

  return (
    <section
      className={cn("mb-6 sm:mb-8", className)}
      data-testid="quick-memo-editor"
      onKeyDown={handleKeyDown}
    >
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-4 sm:p-6">
          <h2 className="card-title text-lg sm:text-xl mb-4">
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6 text-primary"
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
            <div className="form-control">
              {/* 使用 MilkdownEditor 支持 Markdown 原地渲染 */}
              <div
                ref={containerRef}
                className="border border-base-300 rounded-lg overflow-hidden"
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
                  articlePath="Memos/assets"
                  contentSource="webdav"
                  editorId="quick-memo-editor"
                  className="min-h-full"
                  data-testid="quick-memo-editor"
                />
              </div>

              <div className="label !mt-1" id={helpId}>
                <span className="label-text-alt text-base-content/60">{content.length} 字符</span>
                <span className="label-text-alt text-base-content/60">
                  {shortcutKey}+Enter 发布
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="form-control">
                <label className="label cursor-pointer space-x-2">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="checkbox checkbox-primary checkbox-sm"
                    disabled={isSaving}
                  />
                  <span className="label-text text-sm">
                    {isPublic ? (
                      <span className="flex items-center space-x-1 text-info">
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
                      <span className="flex items-center space-x-1 text-warning">
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
                disabled={!content.trim() || isSaving}
                className={cn("btn btn-primary btn-sm gap-2", isSaving && "loading")}
                aria-label={isSaving ? "正在发布 Memo..." : "发布 Memo"}
                aria-describedby={helpId}
              >
                {!isSaving && (
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
