import { redirect } from "next/navigation";

export const metadata = {
  title: "页面重定向",
  description: "重定向到数据同步页面",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminCachePage() {
  // 重定向到新的数据同步页面
  redirect("/admin/data-sync");
}
