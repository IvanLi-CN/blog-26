import { Check, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { type CloseButtonProps, ToastContainer, type ToastOptions, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { cn } from "@/lib/utils";

const ADMIN_TOAST_CONTAINER_ID = "admin-toast-viewport";

type AdminToastTone = "success" | "danger" | "default" | "loading";

function AdminToastIcon({ tone }: { tone: AdminToastTone }) {
  if (tone === "loading") {
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

function AdminToastContent({ tone, children }: { tone: AdminToastTone; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-[1rem] border bg-card/96 px-4 py-3 text-sm leading-6 text-foreground shadow-xl shadow-shadow-soft",
        tone === "success" && "border-success/24 bg-success/12",
        tone === "danger" && "border-destructive/24 bg-destructive/12",
        tone === "default" && "border-border/68 bg-card/96",
        tone === "loading" && "border-primary/24 bg-primary/10"
      )}
    >
      <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center">
        <AdminToastIcon tone={tone} />
      </span>
      <div className="min-w-0 flex-1 text-pretty">{children}</div>
    </div>
  );
}

function AdminToastCloseButton({ closeToast, ariaLabel }: CloseButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        closeToast?.(event);
      }}
      className="ml-2 mt-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/78 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      data-testid="admin-toast-close"
    >
      <X className="size-4" aria-hidden />
    </button>
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
      closeButton={AdminToastCloseButton}
      limit={4}
      toastClassName={() =>
        cn(
          "Toastify__toast !mb-3 !min-h-0 !w-[min(34rem,calc(100vw-2rem))] !overflow-visible !rounded-none !border-0 !bg-transparent !p-0 !shadow-none",
          "[&_.Toastify__toast-body]:!m-0 [&_.Toastify__toast-body]:!min-w-0 [&_.Toastify__toast-body]:!p-0"
        )
      }
      className={cn(
        "Toastify__toast-container !fixed !right-6 !top-24 !z-[90] !w-auto !p-0 pointer-events-none max-lg:!right-4 max-lg:!top-20"
      )}
      toastStyle={{ pointerEvents: "auto" }}
      theme="auto"
    />
  );
}

export function showAdminToast(tone: AdminToastTone, message: ReactNode, options?: ToastOptions) {
  return toast(<AdminToastContent tone={tone}>{message}</AdminToastContent>, {
    containerId: ADMIN_TOAST_CONTAINER_ID,
    autoClose: tone === "loading" ? false : 3600,
    closeButton: tone === "loading" ? false : undefined,
    closeOnClick: tone !== "loading",
    ...options,
  });
}

export function dismissAdminToast(id: ReturnType<typeof toast>) {
  toast.dismiss(id);
}
