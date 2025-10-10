"use client";

/**
 * Notification Test Page
 *
 * Development/test-only page for validating toast notifications
 */

import { redirect } from "next/navigation";
import { toast } from "react-toastify";
import ToastAlert from "@/components/ui/ToastAlert";

function ensureNonProd() {
  if (process.env.NODE_ENV === "production") redirect("/404");
}

export default function NotifyTestPage() {
  ensureNonProd();

  const fire = (type: "success" | "error" | "info" | "warning", message: string) => {
    const el = <ToastAlert type={type} message={message} onAction={() => toast.dismiss()} />;
    switch (type) {
      case "success":
        toast.success(el);
        break;
      case "error":
        toast.error(el);
        break;
      case "warning":
        toast.warning(el);
        break;
      default:
        toast.info(el);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold">通知功能测试</h1>
      <p className="text-base-content/70">
        该页面用于快速验证 React Toastify + daisyUI 的通知样式与交互（位置：右下角）。
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          className="btn btn-success"
          onClick={() => fire("success", "操作成功")}
        >
          成功
        </button>
        <button type="button" className="btn btn-error" onClick={() => fire("error", "发生错误")}>
          错误
        </button>
        <button type="button" className="btn btn-warning" onClick={() => fire("warning", "请注意")}>
          警告
        </button>
        <button
          type="button"
          className="btn btn-info"
          onClick={() => fire("info", "这里有一条通知")}
        >
          信息
        </button>
      </div>

      <div className="card bg-base-100 shadow">
        <div className="card-body space-y-3">
          <h2 className="card-title">长文案测试</h2>
          <p className="text-sm text-base-content/70">
            点击下方按钮发出一条较长的通知，检查多行对齐与关闭按钮对齐情况。
          </p>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() =>
              fire(
                "info",
                "这是一条较长的通知文案，用于测试多行内容时的样式表现与对齐效果。请仔细观察右下角的显示。"
              )
            }
          >
            发送长通知
          </button>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";

// Intentionally no metadata export for client component page
