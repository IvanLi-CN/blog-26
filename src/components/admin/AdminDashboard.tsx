"use client";

import { trpc } from "../../lib/trpc";

export default function AdminDashboard() {
  const { data: stats, isLoading: loading, error, refetch } = trpc.admin.dashboard.stats.useQuery();
  const { data: recentActivity } = trpc.admin.dashboard.recentActivity.useQuery({});

  const handleRefresh = () => {
    refetch();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
        <span className="ml-2">正在加载数据...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>加载数据失败</span>
        <button type="button" onClick={handleRefresh} className="btn btn-sm">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-4xl font-bold flex items-center">📊 管理员仪表盘</h1>
          <div className="flex gap-2">
            <a href="/admin" className="btn btn-outline">
              ← 返回管理面板
            </a>
            <button type="button" onClick={handleRefresh} className="btn btn-primary">
              🔄 刷新数据
            </button>
          </div>
        </div>
        <p className="text-base-content/70">查看网站统计数据、活动日历和最近活动</p>
      </div>

      {/* 总体统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* 内容统计 */}
        <div className="card bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold opacity-90">总文章数</h3>
                <p className="text-3xl font-bold">{stats?.posts.total || 0}</p>
                <p className="text-sm opacity-75">
                  已发布: {stats?.posts.published || 0} | 草稿: {stats?.posts.draft || 0}
                </p>
              </div>
              <div className="text-4xl opacity-80">📝</div>
            </div>
          </div>
        </div>

        {/* 评论统计 */}
        <div className="card bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold opacity-90">总评论数</h3>
                <p className="text-3xl font-bold">{stats?.comments.total || 0}</p>
                <p className="text-sm opacity-75">
                  待审: {stats?.comments.pending || 0} | 已批准: {stats?.comments.approved || 0}
                </p>
              </div>
              <div className="text-4xl opacity-80">💬</div>
            </div>
          </div>
        </div>

        {/* 用户统计 */}
        <div className="card bg-gradient-to-br from-green-500 to-green-700 text-white shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold opacity-90">用户数据</h3>
                <p className="text-3xl font-bold">{stats?.users.total || 0}</p>
                <p className="text-sm opacity-75">注册用户数量</p>
              </div>
              <div className="text-4xl opacity-80">👥</div>
            </div>
          </div>
        </div>

        {/* 互动统计 */}
        <div className="card bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold opacity-90">互动数据</h3>
                <p className="text-3xl font-bold">{stats?.activity.verificationCodes || 0}</p>
                <p className="text-sm opacity-75">验证码请求</p>
              </div>
              <div className="text-4xl opacity-80">❤️</div>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">📝 内容管理</h2>
            <p>管理文章、页面和媒体文件</p>
            <div className="card-actions justify-end">
              <a href="/admin/posts" className="btn btn-primary">
                管理文章
              </a>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">💬 评论管理</h2>
            <p>审核和管理用户评论</p>
            <div className="card-actions justify-end">
              <a href="/admin/comments" className="btn btn-primary">
                管理评论
              </a>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">⚙️ 系统设置</h2>
            <p>缓存管理和系统配置</p>
            <div className="card-actions justify-end">
              <a href="/admin/cache" className="btn btn-primary">
                系统设置
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 最近活动 */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">📈 最近活动</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>描述</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity && recentActivity.length > 0 ? (
                  recentActivity.map((activity) => (
                    <tr key={activity.id}>
                      <td>
                        {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : "N/A"}
                      </td>
                      <td>
                        <div
                          className={`badge ${
                            activity.type === "post"
                              ? "badge-secondary"
                              : activity.type === "comment"
                                ? "badge-primary"
                                : "badge-accent"
                          }`}
                        >
                          {activity.type === "post"
                            ? "文章"
                            : activity.type === "comment"
                              ? "评论"
                              : "用户"}
                        </div>
                      </td>
                      <td>
                        {activity.title}
                        {activity.content && (
                          <div className="text-sm text-base-content/70 mt-1">
                            {activity.content}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="badge badge-info">{"活跃"}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-center text-base-content/50">
                      暂无最近活动
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
