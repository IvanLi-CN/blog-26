import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminLoginForm from "../../components/admin/AdminLoginForm";
import { isAdminFromRequest } from "../../lib/auth";

export const metadata = {
  title: "管理员登录",
  description: "管理员登录界面",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLoginPage() {
  // 如果已经是管理员，重定向到管理界面
  const headersList = await headers();
  const isAdmin = await isAdminFromRequest(headersList);

  if (isAdmin) {
    redirect("/admin/dashboard");
  }

  const luosimaoSiteKey = process.env.PUBLIC_LUOSIMAO_SITE_KEY;

  return <AdminLoginForm luosimaoSiteKey={luosimaoSiteKey} />;
}
