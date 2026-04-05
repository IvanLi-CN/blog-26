"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { MilkdownEditor, type MilkdownEditorRef } from "./MilkdownEditor";

export interface QuickMemoEditValues {
  content: string;
  isPublic: boolean;
}

export interface QuickMemoEditModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: (values: QuickMemoEditValues) => Promise<void>;
  memoTitle?: string;
  initialContent?: string;
  initialIsPublic?: boolean;
  articlePath?: string;
  contentSource?: "webdav" | "local";
  isLoading?: boolean;
  isSaving?: boolean;
  errorMessage?: string;
}

export function QuickMemoEditModal({
  open,
  onClose,
  onSave,
  memoTitle,
  initialContent,
  initialIsPublic = true,
  articlePath,
  contentSource = "webdav",
  isLoading = false,
  isSaving = false,
  errorMessage,
}: QuickMemoEditModalProps) {
  const editorRef = useRef<MilkdownEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState(initialContent ?? "");
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 根据平台确定快捷键提示
  const shortcutKey = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl";
    return navigator.platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl";
  }, []);

  // 模态框打开时，同步外部初始值
  useEffect(() => {
    if (!open) return;
    setContent(initialContent ?? "");
    setIsPublic(initialIsPublic);
  }, [open, initialContent, initialIsPublic]);

  // 关闭模态框时重置本地提交状态
  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (isSaving || isSubmitting) return;
    onClose();
  }, [isSaving, isSubmitting, onClose]);

  useEffect(() => {
    if (!open) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, handleClose]);

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!onSave || isSaving || isSubmitting || !content.trim()) {
        return;
      }

      setIsSubmitting(true);
      try {
        let processedContent = content.trim();

        if (editorRef.current) {
          processedContent = await editorRef.current.processInlineImages(processedContent);
        }

        await onSave({
          content: processedContent,
          isPublic,
        });
      } catch (error) {
        console.error("快速编辑保存失败:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [content, isPublic, onSave, isSaving, isSubmitting]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  const saving = isSaving || isSubmitting;
  const disableActions = saving || isLoading;
  const showSkeleton = isLoading && !content;

  if (!open) {
    return null;
  }

  return (
    <div className="nature-modal z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        className="nature-modal-backdrop"
        aria-label="关闭快速编辑"
        onClick={handleClose}
      />
      <div className="nature-modal-panel flex max-h-[85vh] w-11/12 max-w-4xl flex-col overflow-hidden p-0">
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgba(var(--nature-border-rgb),0.62)] bg-[rgba(var(--nature-surface-rgb),0.92)] px-6 py-4"
          data-testid="quick-memo-edit-header"
        >
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--nature-text)]">快速编辑 Memo</h3>
            <p className="line-clamp-1 text-sm text-[color:var(--nature-text-soft)]">
              {memoTitle ? `正在编辑：${memoTitle}` : "使用富文本快速调整闪念内容"}
            </p>
          </div>
          <button
            type="button"
            className="nature-icon-button"
            aria-label="关闭快速编辑"
            onClick={handleClose}
            disabled={saving}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* 编辑器区域 */}
            <section
              ref={containerRef}
              className={cn(
                "overflow-hidden rounded-[1.5rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.82)]",
                showSkeleton && "animate-pulse"
              )}
              data-testid="quick-memo-edit-container"
            >
              {showSkeleton ? (
                <div className="h-64" />
              ) : (
                <MilkdownEditor
                  ref={editorRef}
                  content={content}
                  onChange={setContent}
                  placeholder="更新这条闪念..."
                  articlePath={articlePath ?? memoTitle ?? ""}
                  contentSource={contentSource}
                  editorId="quick-memo-edit"
                  className="min-h-[16rem]"
                  data-testid="quick-memo-edit-editor"
                />
              )}
              <div className="flex items-center justify-between border-t border-[rgba(var(--nature-border-rgb),0.62)] bg-[rgba(var(--nature-highlight-rgb),0.18)] px-4 py-2 text-sm text-[color:var(--nature-text-soft)]">
                <span>{content.length} 字符</span>
                <span>{shortcutKey}+Enter 保存</span>
              </div>
            </section>

            {errorMessage && (
              <div className="nature-alert nature-alert-error shadow-sm">
                <span className="text-lg">!</span>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <div className="border-t border-[rgba(var(--nature-border-rgb),0.62)] px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-3">
                <span className="text-sm text-[color:var(--nature-text-soft)]">
                  {isPublic ? "公开发布" : "私有保存"}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  disabled={disableActions}
                />
                <span
                  className="nature-switch"
                  data-state={isPublic ? "checked" : "unchecked"}
                  aria-disabled={disableActions ? "true" : "false"}
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="nature-button nature-button-ghost min-h-10 px-4 py-2 text-sm"
                  onClick={handleClose}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="nature-button nature-button-primary min-h-10 gap-2 px-4 py-2 text-sm"
                  disabled={disableActions || !content.trim()}
                >
                  {saving && <span className="nature-spinner h-4 w-4" />}
                  {saving ? "保存中..." : "保存更改"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
