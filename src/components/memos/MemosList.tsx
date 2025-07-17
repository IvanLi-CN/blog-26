import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { type Attachment, AttachmentGrid } from './AttachmentGrid';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

interface Memo {
  id: string;
  slug: string;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
  isPublic: boolean;
  attachments?: Attachment[];
  tags?: string[];
}

interface MemosListProps {
  isAdmin?: boolean;
}

export function MemosList({ isAdmin = false }: MemosListProps) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取 Memos 数据
  const { data: memosData, isLoading, error: fetchError } = trpc.memos.getAll.useQuery();

  useEffect(() => {
    if (memosData) {
      setMemos(memosData);
      setLoading(false);
    }
    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
    }
  }, [memosData, fetchError]);

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 删除 Memo 的 mutation
  const deleteMemoMutation = trpc.memos.delete.useMutation({
    onSuccess: () => {
      // 使用 React Query 的 invalidation 来刷新数据
      utils.memos.getAll.invalidate();
    },
    onError: (error) => {
      alert(`删除失败: ${error.message}`);
    },
  });

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这条 Memo 吗？')) {
      deleteMemoMutation.mutate({ id });
    }
  };

  // 格式化日期 - 友好显示
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // 3个月 = 90天
    if (diffDays > 90) {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // 友好时间显示
    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    return `${Math.floor(diffDays / 30)}个月前`;
  };

  // 完整日期格式 - 用于悬浮提示
  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">Memos 功能暂时不可用</p>
          <p className="text-sm">请稍后再试，或联系管理员</p>
        </div>
      </div>
    );
  }

  if (memos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">还没有任何 Memo</p>
          {isAdmin && <p className="text-sm">使用上方的编辑器创建第一条 Memo 吧！</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {memos.map((memo, index) => (
        <div key={memo.id} className="relative">
          {/* 时间线连接线 */}
          {index < memos.length - 1 && (
            <div className="absolute left-5 top-12 w-0.5 h-full bg-gradient-to-b from-primary/30 to-transparent -z-10"></div>
          )}

          {/* Memo 卡片 */}
          <div className="flex items-start space-x-5">
            {/* 时间线圆点 */}
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg ring-4 ring-white dark:ring-gray-900">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </div>

            {/* Memo 内容 */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 dark:border-gray-700 overflow-hidden">
              {/* 头部信息 */}
              <div className="flex items-center justify-between px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-600">
                <div className="flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span title={formatFullDate(memo.createdAt)} className="cursor-help">
                    {formatDate(memo.createdAt)}
                  </span>
                  {memo.updatedAt !== memo.createdAt && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span title={formatFullDate(memo.updatedAt)} className="cursor-help">
                        已编辑
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {/* 公开/私有状态指示器 */}
                  {isAdmin && (
                    <div className="flex items-center">
                      {memo.isPublic ? (
                        <div className="flex items-center space-x-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium border border-blue-200 dark:border-blue-800">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>公开</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium border border-amber-200 dark:border-amber-800">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                          <span>私有</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 管理员操作按钮 */}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(memo.id)}
                      disabled={deleteMemoMutation.isPending}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                      title="删除"
                    >
                      {deleteMemoMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Memo 内容 */}
              <div className="px-6 pb-4">
                <div className="prose prose-sm max-w-none dark:prose-invert prose-gray dark:prose-gray prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-primary prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-code:text-primary prose-code:bg-gray-100 dark:prose-code:bg-gray-700 prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-p:my-2 prose-headings:my-2">
                  <SimpleMarkdownPreview content={memo.content} />
                </div>

                {/* 标签显示 */}
                {memo.tags && memo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {memo.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 附件显示 */}
                {memo.attachments && memo.attachments.length > 0 && (
                  <div className="mt-3">
                    <AttachmentGrid attachments={memo.attachments} editable={false} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
