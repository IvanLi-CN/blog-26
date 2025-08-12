import AdminPostsManager from "../../../components/admin/AdminPostsManager";

export const metadata = {
  title: "文章管理",
  description: "管理博客文章和内容",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPostsPage() {
  return <AdminPostsManager />;
}
