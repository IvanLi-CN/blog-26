import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { AdminToastViewport, showAdminToast } from "~/components/admin-toast";

function ToastGallery() {
  useEffect(() => {
    showAdminToast("danger", "未找到文件：文件不存在：Hardware/missing.md", {
      autoClose: false,
      toastId: "toast-gallery-danger",
    });
    showAdminToast("success", "已保存 Hardware/usb-pd.md", {
      autoClose: false,
      toastId: "toast-gallery-success",
    });
    showAdminToast("default", "复制 1 项，右键目录或空白处后可粘贴。", {
      autoClose: false,
      toastId: "toast-gallery-default",
    });
  }, []);

  return (
    <div className="relative min-h-[360px] overflow-hidden bg-background p-6 text-foreground">
      <AdminToastViewport />
      <div className="max-w-xl rounded-[1.25rem] border border-border/54 bg-card/62 p-5 shadow-xl shadow-shadow-soft">
        <h2 className="text-lg font-semibold">文章编辑器</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          打开文章、切换编辑模式，并在保存前检查预览。
        </p>
        <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
          <span>---</span>
          <span>title: USB PD</span>
          <span>---</span>
          <span># USB PD</span>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Admin/Feedback/Toast",
  component: ToastGallery,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Admin toast 状态画廊，覆盖错误、成功和默认反馈在编辑器页面上的可读性。",
      },
    },
  },
} satisfies Meta<typeof ToastGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ReadableFloatingToasts: Story = {};
