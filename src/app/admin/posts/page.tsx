import AdminPostsManager from "../../../components/admin/AdminPostsManager";
import { ensureAdminOrInterrupt } from "../../../lib/admin-gate";

export const metadata = {
  title: "文章管理",
  description: "管理博客文章和内容",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPostsPage() {
  await ensureAdminOrInterrupt();
  return <AdminPostsManager />;
}
