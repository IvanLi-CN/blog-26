import AdminLoginForm from "../../../components/admin/AdminLoginForm";

export const metadata = {
  title: "管理员登录",
  description: "管理员登录界面",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLoginPage() {
  const luosimaoSiteKey = process.env.PUBLIC_LUOSIMAO_SITE_KEY;

  return <AdminLoginForm luosimaoSiteKey={luosimaoSiteKey} />;
}
