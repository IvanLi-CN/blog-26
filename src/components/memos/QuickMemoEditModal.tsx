"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { processInlineImagesCompat } from "@/lib/image-processing";
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
  contentSource?: "local";
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
  contentSource = "local",
  isLoading = false,
  isSaving = false,
  errorMessage,
}: QuickMemoEditModalProps) {
  const editorRef = useRef<MilkdownEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogPanelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const returnScrollYRef = useRef<number | null>(null);
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

  useLayoutEffect(() => {
    if (!open) return;
    returnScrollYRef.current = window.scrollY;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const returnScrollY = returnScrollYRef.current;
      if (returnScrollY !== null && window.scrollY !== returnScrollY) {
        window.scrollTo(0, returnScrollY);
      }
      returnScrollYRef.current = null;
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (isLoading) {
      dialogPanelRef.current?.focus({ preventScroll: true });
      return;
    }

    let attempts = 0;
    let frame = 0;
    const focusEditor = () => {
      const editor = containerRef.current?.querySelector<HTMLElement>(".ProseMirror");
      if (editor) {
        editor.focus({ preventScroll: true });
        return;
      }
      attempts += 1;
      if (attempts < 40) {
        frame = requestAnimationFrame(focusEditor);
      } else {
        dialogPanelRef.current?.focus({ preventScroll: true });
      }
    };
    frame = requestAnimationFrame(focusEditor);
    return () => cancelAnimationFrame(frame);
  }, [open, isLoading]);

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!onSave || isSaving || isSubmitting) return;

      let latestContent = content;
      try {
        latestContent = editorRef.current?.getMarkdown() ?? content;
      } catch {
        // The editor ref may not be ready while the loading state is changing.
      }
      if (!latestContent.trim()) return;

      let didSaveSucceed = false;
      setIsSubmitting(true);
      try {
        let processedContent = latestContent.trim();

        if (editorRef.current) {
          processedContent = await editorRef.current.processInlineImages(processedContent);
        }

        processedContent = await processInlineImagesCompat(
          processedContent,
          contentSource,
          articlePath || memoTitle || "__unknown__.md",
          "relative"
        );

        await onSave({
          content: processedContent,
          isPublic,
        });
        didSaveSucceed = true;
      } catch (error) {
        console.error("快速编辑保存失败:", error);
      } finally {
        setIsSubmitting(false);
      }

      if (didSaveSucceed) {
        onClose();
      }
    },
    [
      articlePath,
      content,
      contentSource,
      isPublic,
      isSaving,
      isSubmitting,
      memoTitle,
      onClose,
      onSave,
    ]
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

  const handleDialogKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = dialogPanelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const saving = isSaving || isSubmitting;
  const disableActions = saving || isLoading;
  const showSkeleton = isLoading && !content;

  if (!open) {
    return null;
  }

  return (
    <div
      className="nature-modal quick-memo-edit-modal z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-memo-edit-title"
      aria-describedby="quick-memo-edit-context"
      data-testid="quick-memo-edit-modal"
      onKeyDown={handleDialogKeyDown}
    >
      <button
        type="button"
        className="nature-modal-backdrop"
        aria-label="关闭快速编辑"
        onClick={handleClose}
      />
      <div
        ref={dialogPanelRef}
        className="nature-modal-panel quick-memo-edit-panel"
        data-testid="quick-memo-edit-panel"
        data-visual-evidence-target
        tabIndex={-1}
      >
        <div className="quick-memo-edit-header" data-testid="quick-memo-edit-header">
          <div className="min-w-0">
            <h3 id="quick-memo-edit-title" className="quick-memo-edit-title">
              编辑 Memo
            </h3>
            <p id="quick-memo-edit-context" className="quick-memo-edit-context">
              {memoTitle ? `正在编辑：${memoTitle}` : "正在编辑当前 Memo"}
            </p>
          </div>
          <button
            type="button"
            className="nature-icon-button quick-memo-edit-close"
            aria-label="关闭快速编辑"
            onClick={handleClose}
            disabled={saving}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="quick-memo-edit-form">
          <div className="quick-memo-edit-body" data-testid="quick-memo-edit-body">
            <section
              ref={containerRef}
              className={cn("quick-memo-edit-container", showSkeleton && "animate-pulse")}
              data-testid="quick-memo-edit-container"
            >
              {showSkeleton ? (
                <div className="quick-memo-edit-skeleton" />
              ) : (
                <MilkdownEditor
                  ref={editorRef}
                  content={content}
                  onChange={setContent}
                  placeholder="更新这条闪念..."
                  articlePath={articlePath ?? memoTitle ?? ""}
                  contentSource={contentSource}
                  editorId="quick-memo-edit"
                  className="quick-memo-edit-editor"
                  data-testid="quick-memo-edit-editor"
                />
              )}
            </section>

            {errorMessage && (
              <div className="nature-alert nature-alert-error quick-memo-edit-error" role="alert">
                <span className="text-lg">!</span>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <footer className="quick-memo-edit-footer" data-testid="quick-memo-edit-footer">
            <div className="quick-memo-edit-footer-content">
              <div className="quick-memo-edit-footer-meta">
                <span aria-live="polite">{content.length} 字符</span>
                <span>{shortcutKey}+Enter 保存</span>
              </div>

              <div className="quick-memo-edit-footer-controls">
                <label
                  className={cn(
                    "quick-memo-edit-visibility",
                    disableActions ? "cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  <span className="quick-memo-edit-visibility-label">
                    {isPublic ? "公开发布" : "私有保存"}
                  </span>
                  <span
                    className="quick-memo-edit-switch-hitbox"
                    data-testid="quick-memo-edit-switch-hitbox"
                  >
                    <input
                      type="checkbox"
                      data-testid="quick-memo-visibility-input"
                      className="nature-switch-input peer quick-memo-edit-switch-input"
                      checked={isPublic}
                      onChange={(event) => setIsPublic(event.target.checked)}
                      disabled={disableActions}
                    />
                    <span
                      data-testid="quick-memo-visibility-switch"
                      className="nature-switch pointer-events-none"
                      data-state={isPublic ? "checked" : "unchecked"}
                      aria-disabled={disableActions ? "true" : "false"}
                    />
                  </span>
                </label>

                <div className="quick-memo-edit-actions">
                  <button
                    type="button"
                    className="nature-button nature-button-ghost quick-memo-edit-action"
                    onClick={handleClose}
                    disabled={saving}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="nature-button nature-button-primary quick-memo-edit-action"
                    disabled={disableActions || !content.trim()}
                  >
                    {saving && <span className="nature-spinner h-4 w-4" />}
                    {saving ? "保存中..." : "保存更改"}
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
