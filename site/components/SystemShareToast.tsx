"use client";

import { Check, LoaderCircle, LogIn, RefreshCw, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { type Id, ToastContainer, type ToastOptions, toast, Zoom } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { consumeSystemShareSuccessNotice } from "../lib/system-share-notice";
import "./SystemShareToast.css";

export const SYSTEM_SHARE_TOAST_ID = "system-share-publish";

type ToastTone = "progress" | "success" | "error";

/**
 * The notice docks under the chrome that owns the top of the current page: the
 * `发布 Memo` header on the confirmation route, the public site header on the
 * destination Memo page. Measuring the rendered chrome lets the device safe
 * area be inherited instead of restated. Once that chrome scrolls away the
 * notice stays at the top safe area, so scrolling never moves the notice
 * relative to the user. See UX.md.
 */
const NOTICE_GAP_PX = 8;
const FALLBACK_INSET_PX = 12;

function focusToastTestId(testId: string) {
  if (typeof document === "undefined") return;
  const focus = () => {
    const target = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (!target) return false;
    target.focus();
    return true;
  };
  queueMicrotask(() => {
    if (focus()) return;
    window.requestAnimationFrame(() => focus());
  });
}

function ToastBody({
  tone,
  message,
  onRetry,
  actionLabel = "重试",
  onClose,
}: {
  tone: ToastTone;
  message: ReactNode;
  onRetry?: () => void;
  actionLabel?: string;
  onClose?: () => void;
}) {
  const Icon = tone === "progress" ? LoaderCircle : tone === "success" ? Check : TriangleAlert;

  function handleRetry() {
    onRetry?.();
    if (typeof window !== "undefined") {
      const deadline = Date.now() + 5000;
      let sawProgress = false;
      const focusRetryLifecycle = () => {
        const progress = document.querySelector<HTMLElement>(
          '[data-testid="system-share-toast-progress"]'
        );
        if (progress) {
          sawProgress = true;
          progress.focus();
        }
        const retry = document.querySelector<HTMLButtonElement>(
          '[data-testid="system-share-toast-retry"]'
        );
        if (retry && sawProgress) {
          retry.focus();
          return;
        }
        if (Date.now() < deadline) window.setTimeout(focusRetryLifecycle, 32);
      };
      window.setTimeout(focusRetryLifecycle, 0);
    }
  }

  return (
    <div
      className="system-share-toast-body"
      data-testid={`system-share-toast-${tone}`}
      tabIndex={tone === "progress" ? -1 : undefined}
    >
      <Icon
        className={`system-share-toast-icon system-share-toast-icon-${tone}`}
        aria-hidden="true"
      />
      <div className="system-share-toast-copy">
        <span>{message}</span>
        {onRetry ? (
          <button
            className="system-share-toast-retry"
            type="button"
            data-testid="system-share-toast-retry"
            onClick={handleRetry}
          >
            {actionLabel === "登录" ? (
              <LogIn aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {actionLabel}
          </button>
        ) : null}
        {onClose ? (
          <button
            className="system-share-toast-close"
            type="button"
            aria-label="关闭提示"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SystemShareToastViewport() {
  useEffect(() => {
    // The confirmation document hands its success notice to the destination;
    // only the destination path consumes it, once.
    const message = consumeSystemShareSuccessNotice(window.location.pathname);
    if (message) showSystemShareSuccess(message);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    let frame = 0;
    // While a notice is on screen its offset is latched, so scrolling cannot
    // move it relative to the user. Once no notice is present the next one
    // docks again under the chrome that currently owns the top of the page.
    let noticeOffset: number | null = null;

    const updateOffset = () => {
      const container = document.querySelector<HTMLElement>(".system-share-toast-container");
      const hasNotice = Boolean(container?.querySelector(".system-share-toast"));
      if (hasNotice && noticeOffset !== null) {
        root.style.setProperty("--system-share-notice-top", `${noticeOffset}px`);
        return;
      }
      const anchor =
        document.querySelector<HTMLElement>(".system-share-page-header") ??
        document.querySelector<HTMLElement>(".nature-site-header[data-public-header]");
      const anchorBottom = anchor?.getBoundingClientRect().bottom;
      // Chrome that already scrolled off cannot be docked against; the notice
      // then keeps the top safe-area inset instead of landing in the content.
      noticeOffset =
        typeof anchorBottom === "number" && anchorBottom > 0
          ? Math.round(anchorBottom + NOTICE_GAP_PX)
          : FALLBACK_INSET_PX;
      root.style.setProperty("--system-share-notice-top", `${noticeOffset}px`);
    };

    const clearLatchedOffset = () => {
      noticeOffset = null;
      schedule();
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateOffset);
    };

    // Both anchors mount after this viewport, so observe the document rather
    // than reading a header that does not exist yet.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    // A dismissed notice must not keep its old dock for the next one.
    const container = document.querySelector(".system-share-toast-container");
    const mutationObserver = new MutationObserver(() => {
      if (!container?.querySelector(".system-share-toast")) clearLatchedOffset();
      else schedule();
    });
    if (container) mutationObserver.observe(container, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", clearLatchedOffset);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", clearLatchedOffset);
      root.style.removeProperty("--system-share-notice-top");
    };
  }, []);

  return (
    <ToastContainer
      containerId={SYSTEM_SHARE_TOAST_ID}
      position="bottom-center"
      transition={Zoom}
      newestOnTop
      closeOnClick={false}
      pauseOnFocusLoss={false}
      pauseOnHover={false}
      draggable={false}
      limit={1}
      icon={false}
      closeButton={false}
      toastClassName={() => "system-share-toast"}
      className="system-share-toast-container"
      theme="light"
    />
  );
}

export function showSystemShareProgress(message = "正在发布…") {
  const options: ToastOptions = {
    containerId: SYSTEM_SHARE_TOAST_ID,
    toastId: SYSTEM_SHARE_TOAST_ID,
    closeButton: false,
    autoClose: false,
    closeOnClick: false,
    role: "status",
    isLoading: true,
  };
  const render = <ToastBody tone="progress" message={message} />;
  if (toast.isActive(SYSTEM_SHARE_TOAST_ID)) {
    toast.update(SYSTEM_SHARE_TOAST_ID, { ...options, render, type: "default" });
    focusToastTestId("system-share-toast-progress");
    return SYSTEM_SHARE_TOAST_ID;
  }
  const id = toast.loading(render, options);
  focusToastTestId("system-share-toast-progress");
  return id;
}

export function showSystemShareSuccess(message = "发布成功") {
  const options: ToastOptions = {
    containerId: SYSTEM_SHARE_TOAST_ID,
    toastId: SYSTEM_SHARE_TOAST_ID,
    closeButton: false,
    autoClose: 3200,
    closeOnClick: false,
    type: "success",
    role: "status",
    delay: 0,
  };
  const render = (
    <ToastBody tone="success" message={message} onClose={() => dismissSystemShareToast()} />
  );
  if (toast.isActive(SYSTEM_SHARE_TOAST_ID)) {
    toast.update(SYSTEM_SHARE_TOAST_ID, { ...options, render });
    return SYSTEM_SHARE_TOAST_ID;
  }
  return toast(render, options);
}

export function showSystemShareError(message: string, onRetry: () => void, actionLabel = "重试") {
  const options: ToastOptions = {
    containerId: SYSTEM_SHARE_TOAST_ID,
    toastId: SYSTEM_SHARE_TOAST_ID,
    closeButton: false,
    autoClose: false,
    closeOnClick: false,
    type: "error",
    role: "alert",
  };
  const render = (
    <ToastBody
      tone="error"
      message={message}
      actionLabel={actionLabel}
      onRetry={onRetry}
      onClose={() => dismissSystemShareToast()}
    />
  );
  if (toast.isActive(SYSTEM_SHARE_TOAST_ID)) {
    toast.update(SYSTEM_SHARE_TOAST_ID, { ...options, render });
    focusToastTestId("system-share-toast-retry");
    return SYSTEM_SHARE_TOAST_ID;
  }
  const id = toast(render, options);
  focusToastTestId("system-share-toast-retry");
  return id;
}

export function dismissSystemShareToast(id?: Id) {
  toast.dismiss(id ?? SYSTEM_SHARE_TOAST_ID);
}
