export const metadata = {
  title: "评论管理",
  description: "管理和审核用户评论",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminCommentsPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold flex items-center mb-4">💬 评论管理</h1>
        <p className="text-base-content/70">管理和审核用户评论</p>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="alert alert-info">
            <span>评论管理功能正在开发中...</span>
          </div>

          <div className="mt-4">
            <h2 className="text-2xl font-bold mb-4">功能预览</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>查看所有评论列表</li>
              <li>审核待处理评论</li>
              <li>批量操作评论</li>
              <li>评论统计和分析</li>
              <li>垃圾评论过滤</li>
            </ul>
          </div>

          <div className="card-actions justify-end mt-6">
            <a href="/admin/dashboard" className="btn btn-outline">
              返回仪表盘
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
