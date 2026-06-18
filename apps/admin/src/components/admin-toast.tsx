import { Check, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  type Id,
  ToastContainer,
  type ToastContentProps,
  type ToastOptions,
  toast,
} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { cn } from "@/lib/utils";

const ADMIN_TOAST_CONTAINER_ID = "admin-toast-viewport";

type AdminToastTone = "success" | "danger" | "default" | "progress";

function AdminToastIcon({ tone }: { tone: AdminToastTone }) {
  if (tone === "progress") {
    return <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />;
  }

  const Icon = tone === "success" ? Check : tone === "danger" ? TriangleAlert : Info;

  return (
    <Icon
      className={cn(
        "size-4 shrink-0",
        tone === "success" && "text-success",
        tone === "danger" && "text-destructive",
        tone === "default" && "text-primary"
      )}
      aria-hidden
    />
  );
}

function AdminToastContent({
  tone,
  children,
  closeToast,
}: {
  tone: AdminToastTone;
  children: ReactNode;
  closeToast?: ToastContentProps["closeToast"];
}) {
  return (
    <div
      className={cn(
        "pointer-events-none flex w-full min-w-0 items-start gap-3 rounded-[1rem] border bg-card px-4 py-3 text-sm leading-6 text-foreground shadow-xl shadow-shadow-soft",
        tone === "success" && "border-success/30 bg-card",
        tone === "danger" && "border-destructive/30 bg-card",
        tone === "default" && "border-border/68 bg-card",
        tone === "progress" && "border-primary/30 bg-card"
      )}
      data-testid="admin-toast-content"
    >
      <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center">
        <AdminToastIcon tone={tone} />
      </span>
      <div className="min-w-0 flex-1 text-pretty">{children}</div>
      {closeToast ? (
        <button
          type="button"
          aria-label="关闭通知"
          onClick={(event) => {
            event.stopPropagation();
            closeToast(event);
          }}
          className="-mr-1 -mt-1 pointer-events-auto inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/78 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          data-testid="admin-toast-close"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function AdminToastViewport() {
  return (
    <ToastContainer
      containerId={ADMIN_TOAST_CONTAINER_ID}
      position="top-right"
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      draggable="touch"
      pauseOnHover
      hideProgressBar
      autoClose={3600}
      icon={false}
      closeButton={false}
      limit={4}
      toastClassName={() =>
        cn(
          "Toastify__toast !mb-3 !min-h-0 !w-[min(28rem,calc(100vw-2rem))] !overflow-visible !rounded-none !border-0 !bg-transparent !p-0 !shadow-none !pointer-events-none",
          "[&_.Toastify__toast-body]:!m-0 [&_.Toastify__toast-body]:!min-w-0 [&_.Toastify__toast-body]:!w-full [&_.Toastify__toast-body]:!p-0 [&_.Toastify__toast-body]:!pointer-events-none"
        )
      }
      className={cn(
        "Toastify__toast-container !fixed !right-6 !top-4 !z-[90] !w-auto !p-0 pointer-events-none max-lg:!right-4"
      )}
      toastStyle={{ pointerEvents: "none" }}
      theme="auto"
    />
  );
}

export function showAdminToast(tone: AdminToastTone, message: ReactNode, options?: ToastOptions) {
  return toast(
    ({ closeToast }) => (
      <AdminToastContent tone={tone} closeToast={tone === "progress" ? undefined : closeToast}>
        {message}
      </AdminToastContent>
    ),
    {
      containerId: ADMIN_TOAST_CONTAINER_ID,
      autoClose: tone === "progress" ? false : 3600,
      closeOnClick: tone !== "progress",
      ...options,
    }
  );
}

export function dismissAdminToast(id: Id) {
  toast.dismiss(id);
}
