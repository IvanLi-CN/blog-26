import AdminAccessDenied from "../../../components/admin/AdminAccessDenied";
import { getSsoEmailHeaderName } from "../../../lib/admin-config";

export const metadata = {
  title: "管理员访问受限",
  description: "管理员后台访问说明",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLoginPage() {
  const emailHeaderName = getSsoEmailHeaderName();
  // /admin/login 作为显式访问入口，统一视为“未登录”态
  return <AdminAccessDenied status={401} emailHeaderName={emailHeaderName} />;
}
