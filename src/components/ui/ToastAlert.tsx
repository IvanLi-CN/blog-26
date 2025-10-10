"use client";

import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

export function ToastAlert({
  type = "info",
  message,
  actionLabel = "关闭",
  onAction,
}: {
  type?: "success" | "error" | "info" | "warning";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className={cn(
        "alert shadow-sm w-full items-center gap-3",
        type === "success" && "alert-success",
        type === "error" && "alert-error",
        type === "info" && "alert-info",
        type === "warning" && "alert-warning"
      )}
    >
      <span className="flex-1 min-w-0">{message}</span>
      <button
        type="button"
        className="ml-auto inline-flex items-center justify-center rounded-full p-2 hover:bg-base-200/60"
        aria-label={actionLabel}
        onClick={onAction}
      >
        <Icon icon="tabler:x" className="w-4 h-4" />
      </button>
    </div>
  );
}

export default ToastAlert;
