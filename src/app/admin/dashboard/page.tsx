import AdminDashboard from "../../../components/admin/AdminDashboard";

export const metadata = {
  title: "管理员仪表盘",
  description: "管理员仪表盘 - 统计数据和活动日历",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminDashboardPage() {
  return <AdminDashboard />;
}
