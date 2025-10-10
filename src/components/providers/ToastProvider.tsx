"use client";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { cn } from "@/lib/utils";

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
      closeButton={false}
      toastClassName={() =>
        cn(
          "Toastify__toast !p-0 !bg-transparent !shadow-none !border-0 !rounded-none mx-auto w-full max-w-xl"
        )
      }
      bodyClassName={() => cn("!p-0 !m-0")}
      className={cn("Toastify__toast-container !p-4")}
      theme="light"
    />
  );
}

export default ToastProvider;
