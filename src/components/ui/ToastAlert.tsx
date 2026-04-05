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
        "nature-alert w-full items-center gap-3 shadow-sm",
        type === "success" && "nature-alert-success",
        type === "error" && "nature-alert-error",
        type === "info" &&
          "border-[rgba(var(--nature-accent-rgb),0.34)] bg-[rgba(var(--nature-accent-rgb),0.1)]",
        type === "warning" &&
          "border-[color:color-mix(in_srgb,var(--nature-warning)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--nature-warning)_12%,transparent)]"
      )}
    >
      <span className="flex-1 min-w-0">{message}</span>
      {onAction && actionLabel && (
        <button
          type="button"
          className="ml-auto inline-flex items-center justify-center rounded-full px-3 py-1 text-sm hover:bg-[rgba(var(--nature-highlight-rgb),0.2)]"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default ToastAlert;
