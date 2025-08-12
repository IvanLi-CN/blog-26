export const metadata = {
  title: "缓存管理",
  description: "系统缓存和性能管理",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminCachePage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold flex items-center mb-4">🗄️ 缓存管理</h1>
        <p className="text-base-content/70">系统缓存和性能管理</p>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="alert alert-info">
            <span>缓存管理功能正在开发中...</span>
          </div>

          <div className="mt-4">
            <h2 className="text-2xl font-bold mb-4">功能预览</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>查看缓存状态</li>
              <li>清理系统缓存</li>
              <li>内容缓存管理</li>
              <li>数据库查询缓存</li>
              <li>静态资源缓存</li>
              <li>缓存性能监控</li>
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
