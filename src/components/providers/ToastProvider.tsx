"use client";

import { type CloseButtonProps, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { cn } from "@/lib/utils";

// Custom DaisyUI-styled close button, using react-toastify's closeButton API
function CloseBtn({ closeToast, ariaLabel }: CloseButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        closeToast?.(e);
      }}
      className={cn(
        "ml-auto mr-1 inline-flex items-center justify-center rounded-full p-2",
        "text-[color:var(--nature-text-soft)] transition-colors duration-200 hover:bg-[rgba(var(--nature-highlight-rgb),0.24)] hover:text-[color:var(--nature-text)]"
      )}
      data-testid="toast-close"
    >
      {/* Tabler x icon (no extra network requests) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

export function ToastProvider() {
  return (
    <ToastContainer
      position="bottom-right"
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      draggable
      pauseOnHover
      hideProgressBar
      autoClose={3000}
      icon={false}
      // Keep the toast shell inert and let the alert body carry the visible styling.
      closeButton={CloseBtn}
      toastClassName={() =>
        cn(
          "Toastify__toast !p-0 !bg-transparent !shadow-none !border-0 !rounded-none mx-auto w-full max-w-xl"
        )
      }
      bodyClassName={() => cn("!p-0 !m-0")}
      className={cn("Toastify__toast-container !p-4 pointer-events-none")}
      containerClassName={cn("!static")}
      // Allow clicks only inside actual toasts so layout doesn’t block page
      toastStyle={{ pointerEvents: "auto" }}
      theme="auto"
    />
  );
}

export default ToastProvider;
