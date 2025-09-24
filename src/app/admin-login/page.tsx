import type { Metadata } from "next";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = {
  title: "管理员登录",
  description: "管理员登录界面",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLoginAliasPage() {
  const luosimaoSiteKey = process.env.NEXT_PUBLIC_LUOSIMAO_SITE_KEY;
  return <AdminLoginForm luosimaoSiteKey={luosimaoSiteKey} />;
}
