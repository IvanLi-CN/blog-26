"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { trpc } from "../../lib/trpc";

export default function AdminPostsManager() {
  const searchInputId = useId();
  const statusSelectId = useId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);

  const { data, isLoading, error, refetch } = trpc.admin.posts.list.useQuery({
    page,
    limit: 10,
    search: search || undefined,
    status,
  });

  const batchUpdateMutation = trpc.admin.posts.batchUpdate.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedPosts([]);
    },
  });

  const deleteMutation = trpc.admin.posts.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    refetch();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.posts) {
      setSelectedPosts(data.posts.map((post) => post.id));
    } else {
      setSelectedPosts([]);
    }
  };

  const handleSelectPost = (postId: string, checked: boolean) => {
    if (checked) {
      setSelectedPosts((prev) => [...prev, postId]);
    } else {
      setSelectedPosts((prev) => prev.filter((id) => id !== postId));
    }
  };

  const handleBatchAction = async (action: "publish" | "unpublish" | "delete") => {
    if (selectedPosts.length === 0) return;

    if (action === "delete") {
      if (!confirm(`确定要删除 ${selectedPosts.length} 篇文章吗？此操作不可恢复。`)) {
        return;
      }
    }

    try {
      await batchUpdateMutation.mutateAsync({
        ids: selectedPosts,
        action,
      });
    } catch (error) {
      console.error("批量操作失败:", error);
    }
  };

  const handleDeletePost = async (postId: string, title: string) => {
    if (!confirm(`确定要删除文章"${title}"吗？此操作不可恢复。`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: postId });
    } catch (error) {
      console.error("删除文章失败:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
        <span className="ml-2">正在加载文章...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>加载文章失败</span>
        <button type="button" onClick={() => refetch()} className="btn btn-sm">
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
          <h1 className="text-4xl font-bold flex items-center">📝 文章管理</h1>
          <div className="flex gap-2">
            <a href="/admin/dashboard" className="btn btn-outline">
              ← 返回仪表盘
            </a>
            <Link href="/admin/posts/editor" className="btn btn-primary">
              ✏️ 新建文章
            </Link>
          </div>
        </div>
        <p className="text-base-content/70">管理博客文章和内容</p>
      </div>

      {/* 搜索和过滤 */}
      <div className="card bg-base-100 shadow-xl mb-6">
        <div className="card-body">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-64">
              <label className="label" htmlFor={searchInputId}>
                <span className="label-text">搜索文章</span>
              </label>
              <input
                id={searchInputId}
                type="text"
                placeholder="搜索标题、内容或 slug..."
                className="input input-bordered w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor={statusSelectId}>
                <span className="label-text">状态</span>
              </label>
              <select
                id={statusSelectId}
                className="select select-bordered"
                value={status}
                onChange={(e) => setStatus(e.target.value as "all" | "published" | "draft")}
              >
                <option value="all">全部</option>
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              🔍 搜索
            </button>
          </form>
        </div>
      </div>

      {/* 批量操作 */}
      {selectedPosts.length > 0 && (
        <div className="alert alert-info mb-6">
          <span>已选择 {selectedPosts.length} 篇文章</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleBatchAction("publish")}
              className="btn btn-sm btn-success"
              disabled={batchUpdateMutation.isPending}
            >
              发布
            </button>
            <button
              type="button"
              onClick={() => handleBatchAction("unpublish")}
              className="btn btn-sm btn-warning"
              disabled={batchUpdateMutation.isPending}
            >
              取消发布
            </button>
            <button
              type="button"
              onClick={() => handleBatchAction("delete")}
              className="btn btn-sm btn-error"
              disabled={batchUpdateMutation.isPending}
            >
              删除
            </button>
          </div>
        </div>
      )}

      {/* 文章列表 */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={data?.posts && selectedPosts.length === data.posts.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th>标题</th>
                  <th>状态</th>
                  <th>发布时间</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data?.posts && data.posts.length > 0 ? (
                  data.posts.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={selectedPosts.includes(post.id)}
                          onChange={(e) => handleSelectPost(post.id, e.target.checked)}
                        />
                      </td>
                      <td>
                        <div>
                          <div className="font-bold">{post.title}</div>
                          <div className="text-sm text-base-content/70">/{post.slug}</div>
                        </div>
                      </td>
                      <td>
                        <div className={`badge ${post.draft ? "badge-warning" : "badge-success"}`}>
                          {post.draft ? "草稿" : "已发布"}
                        </div>
                      </td>
                      <td>{new Date(post.publishDate).toLocaleString()}</td>
                      <td>
                        {post.updateDate ? new Date(post.updateDate).toLocaleString() : "未更新"}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/posts/editor?id=${post.id}`}
                            className="btn btn-sm btn-primary"
                          >
                            编辑
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id, post.title)}
                            className="btn btn-sm btn-error"
                            disabled={deleteMutation.isPending}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center text-base-content/50">
                      {search ? "没有找到匹配的文章" : "暂无文章"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <div className="join">
                <button
                  type="button"
                  className="join-item btn"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  «
                </button>
                <button type="button" className="join-item btn btn-active">
                  第 {page} 页，共 {data.pagination.totalPages} 页
                </button>
                <button
                  type="button"
                  className="join-item btn"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
