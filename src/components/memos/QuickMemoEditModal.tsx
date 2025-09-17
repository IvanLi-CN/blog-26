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
    <div className="modal modal-open z-50" role="dialog" aria-modal="true">
      <div className="modal-box w-11/12 max-w-4xl p-0 max-h-[85vh] overflow-hidden flex flex-col">
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-100"
          data-testid="quick-memo-edit-header"
        >
          <div>
            <h3 className="font-semibold text-lg text-base-content">快速编辑 Memo</h3>
            <p className="text-sm text-base-content/60 line-clamp-1">
              {memoTitle ? `正在编辑：${memoTitle}` : "使用富文本快速调整闪念内容"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="关闭快速编辑"
            onClick={handleClose}
            disabled={saving}
          >
            ✕
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
                "border border-base-300 rounded-xl bg-base-100",
                showSkeleton && "animate-pulse"
              )}
              data-testid="quick-memo-editor"
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
              <div className="px-4 py-2 bg-base-200 border-t border-base-300 flex items-center justify-between text-sm text-base-content/60">
                <span>{content.length} 字符</span>
                <span>{shortcutKey}+Enter 保存</span>
              </div>
            </section>

            {errorMessage && (
              <div className="alert alert-error shadow-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L4.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* 状态切换 */}
          <div className="border-t border-base-200 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="label cursor-pointer gap-3 px-0">
                <span className="label-text text-sm">{isPublic ? "公开发布" : "私有保存"}</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  disabled={disableActions}
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleClose}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={cn("btn btn-primary btn-sm gap-2", saving && "loading")}
                  disabled={disableActions || !content.trim()}
                >
                  {saving ? "保存中..." : "保存更改"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
      <button
        type="button"
        className="modal-backdrop"
        aria-label="关闭快速编辑"
        onClick={handleClose}
      />
    </div>
  );
}
