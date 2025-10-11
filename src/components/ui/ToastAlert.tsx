"use client";

import { cn } from "@/lib/utils";

export function ToastAlert({
  type = "info",
  message,
  actionLabel,
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
      {onAction && actionLabel && (
        <button
          type="button"
          className="ml-auto inline-flex items-center justify-center rounded-full px-3 py-1 text-sm hover:bg-base-200/60"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default ToastAlert;
