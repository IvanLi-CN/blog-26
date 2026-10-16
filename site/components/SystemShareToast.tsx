"use client";

import { Check, LoaderCircle, LogIn, RefreshCw, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { type Id, ToastContainer, type ToastOptions, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./SystemShareToast.css";

export const SYSTEM_SHARE_TOAST_ID = "system-share-publish";

type ToastTone = "progress" | "success" | "error";

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
  return (
    <div className="system-share-toast-body" data-testid={`system-share-toast-${tone}`}>
      <Icon
        className={`system-share-toast-icon system-share-toast-icon-${tone}`}
        aria-hidden="true"
      />
      <div className="system-share-toast-copy">
        <span>{message}</span>
        {onRetry ? (
          <button className="system-share-toast-retry" type="button" onClick={onRetry}>
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
  return (
    <ToastContainer
      containerId={SYSTEM_SHARE_TOAST_ID}
      position="top-right"
      newestOnTop
      closeOnClick={false}
      pauseOnFocusLoss
      pauseOnHover
      draggable={false}
      limit={1}
      icon={false}
      closeButton={false}
      toastClassName={() => "system-share-toast"}
      className="system-share-toast-container"
      toastStyle={{ pointerEvents: "auto" }}
      theme="colored"
    />
  );
}

export function showSystemShareProgress(message = "正在发布…") {
  return toast.loading(<ToastBody tone="progress" message={message} />, {
    containerId: SYSTEM_SHARE_TOAST_ID,
    toastId: SYSTEM_SHARE_TOAST_ID,
    closeButton: false,
    autoClose: false,
    closeOnClick: false,
  });
}

export function showSystemShareSuccess(message = "发布成功") {
  const options: ToastOptions = {
    containerId: SYSTEM_SHARE_TOAST_ID,
    toastId: SYSTEM_SHARE_TOAST_ID,
    closeButton: false,
    autoClose: false,
    closeOnClick: false,
    type: "success",
  };
  if (toast.isActive(SYSTEM_SHARE_TOAST_ID)) {
    toast.update(SYSTEM_SHARE_TOAST_ID, {
      ...options,
      render: <ToastBody tone="success" message={message} />,
    });
    return SYSTEM_SHARE_TOAST_ID;
  }
  return toast(<ToastBody tone="success" message={message} />, options);
}

export function showSystemShareError(message: string, onRetry: () => void, actionLabel = "重试") {
  const options: ToastOptions = {
    containerId: SYSTEM_SHARE_TOAST_ID,
    toastId: SYSTEM_SHARE_TOAST_ID,
    closeButton: false,
    autoClose: false,
    closeOnClick: false,
    type: "error",
  };
  const render = (
    <ToastBody
      tone="error"
      message={message}
      actionLabel={actionLabel}
      onRetry={() => {
        onRetry();
      }}
      onClose={() => dismissSystemShareToast()}
    />
  );
  if (toast.isActive(SYSTEM_SHARE_TOAST_ID)) {
    toast.update(SYSTEM_SHARE_TOAST_ID, { ...options, render });
    return SYSTEM_SHARE_TOAST_ID;
  }
  return toast(render, options);
}

export function dismissSystemShareToast(id?: Id) {
  toast.dismiss(id ?? SYSTEM_SHARE_TOAST_ID);
}
