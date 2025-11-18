import AdminNavbar from "../../components/admin/AdminNavbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base-200">
      <AdminNavbar />

      {/* 主要内容区域 */}
      <main className="w-full px-4 py-8">{children}</main>
    </div>
  );
}
