import { useState } from 'react';
import { trpc } from '~/lib/trpc';
import { TRPCProvider } from './TRPCProvider';

function CommentsTestInner() {
  const [slug, setSlug] = useState('test-post');

  // 使用 tRPC hooks
  const { data: healthData } = trpc.health.useQuery();
  const { data: userData } = trpc.me.useQuery();
  const {
    data: commentsData,
    isLoading,
    error,
  } = trpc.comments.getComments.useQuery({
    slug,
    page: 1,
    limit: 10,
  });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">tRPC 测试组件</h2>

      {/* 健康检查 */}
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <h3 className="font-semibold">健康检查:</h3>
        <pre className="text-sm">{JSON.stringify(healthData, null, 2)}</pre>
      </div>

      {/* 用户信息 */}
      <div className="mb-4 p-4 bg-blue-50 rounded">
        <h3 className="font-semibold">当前用户:</h3>
        <pre className="text-sm">{JSON.stringify(userData, null, 2)}</pre>
      </div>

      {/* 评论测试 */}
      <div className="mb-4 p-4 bg-green-50 rounded">
        <h3 className="font-semibold">评论测试:</h3>
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">文章 Slug:</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="输入文章 slug"
          />
        </div>

        {isLoading && <p className="text-blue-600">加载中...</p>}
        {error && <p className="text-red-600">错误: {error.message}</p>}

        {commentsData && (
          <div>
            <p className="text-sm text-gray-600 mb-2">
              找到 {commentsData.comments.length} 条评论，共 {commentsData.totalPages} 页
              {commentsData.isAdmin && <span className="text-red-500"> (管理员模式)</span>}
            </p>
            <pre className="text-sm bg-white p-2 rounded border overflow-auto max-h-40">
              {JSON.stringify(commentsData, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* 类型安全演示 */}
      <div className="p-4 bg-yellow-50 rounded">
        <h3 className="font-semibold">类型安全演示:</h3>
        <p className="text-sm text-gray-600">
          这个组件展示了 tRPC 的端到端类型安全特性。 所有的 API 调用都有完整的 TypeScript 类型推导，
          包括输入参数和返回值。
        </p>
      </div>
    </div>
  );
}

export function CommentsTest() {
  return (
    <TRPCProvider>
      <CommentsTestInner />
    </TRPCProvider>
  );
}
