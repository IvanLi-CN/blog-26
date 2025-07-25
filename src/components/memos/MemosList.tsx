import { VectorizationStatus } from '~/components/common/VectorizationStatus';
import { trpc } from '~/lib/trpc-client';
import { AttachmentGrid } from './AttachmentGrid';
import CommentCountWithProvider from './CommentCountWithProvider';
import { useInfiniteScroll, useMemos } from './hooks';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

// 使用与hooks.ts相同的类型定义
interface Memo {
  id: string;
  slug: string;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
  isPublic: boolean;
  attachments?: Array<{
    filename: string;
    path: string;
    size?: number;
    isImage: boolean;
  }>;
  tags?: string[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface MemosListProps {
  isAdmin?: boolean;
  initialMemos?: Memo[];
  initialPagination?: Pagination;
}

export function MemosList({ isAdmin = false, initialMemos, initialPagination }: MemosListProps) {
  // 使用新的分页hook，传递初始数据
  const { memos, isLoading, isLoadingMore, error, hasMore, loadMore } = useMemos({
    isAdmin,
    initialMemos,
    initialPagination,
  });

  // 启用无限滚动
  useInfiniteScroll(loadMore, hasMore, isLoadingMore);

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 删除 Memo 的 mutation
  const deleteMemoMutation = trpc.memos.delete.useMutation({
    onSuccess: () => {
      // 刷新数据
      utils.memos.getMemos.invalidate();
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

  if (isLoading) {
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
        <div className="text-base-content/60">
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
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg ring-4 ring-base-100">
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
            <div className="flex-1 card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-200 overflow-hidden relative">
              {/* 管理员删除按钮 - 绝对定位在右上角 */}
              {isAdmin && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(memo.id);
                  }}
                  disabled={deleteMemoMutation.isPending}
                  className="absolute top-2 right-2 btn btn-ghost btn-sm btn-circle text-error hover:bg-error/10 z-20 opacity-60 hover:opacity-100"
                  title="删除"
                >
                  {deleteMemoMutation.isPending ? (
                    <span className="loading loading-spinner loading-xs"></span>
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

              {/* 可点击的链接覆盖整个卡片 */}
              <a href={`/memos/${memo.slug}`} className="block cursor-pointer">
                {/* 头部信息 */}
                <div className="flex items-center justify-between px-6 py-3 pr-12 bg-base-200 border-b border-base-300">
                  <div className="flex items-center space-x-3 text-sm text-base-content/70">
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
                        <span className="text-base-content/40">•</span>
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
                          <div className="badge badge-info badge-sm gap-1">
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
                          <div className="badge badge-warning badge-sm gap-1">
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
                  </div>
                </div>

                {/* Memo 内容 */}
                <div className="card-body">
                  <div className="prose prose-sm max-w-none">
                    <SimpleMarkdownPreview content={memo.content} removeTags={true} />
                  </div>

                  {/* 标签显示 */}
                  {memo.tags && memo.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {memo.tags.map((tag: string, index: number) => (
                        <span key={index} className="badge badge-outline badge-sm">
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

                {/* 右下角状态信息 */}
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  {/* 评论数 */}
                  <CommentCountWithProvider slug={memo.slug} />

                  {/* 向量化状态 */}
                  <VectorizationStatus
                    slug={memo.slug}
                    size="sm"
                    className="opacity-40 hover:opacity-70 transition-opacity"
                  />
                </div>
              </a>
            </div>
          </div>
        </div>
      ))}

      {/* 加载更多指示器 */}
      {isLoadingMore && (
        <div className="flex justify-center items-center py-8">
          <div className="flex items-center space-x-2 text-base-content/60">
            <span className="loading loading-spinner loading-sm"></span>
            <span>加载更多...</span>
          </div>
        </div>
      )}

      {/* 没有更多数据的提示 */}
      {!hasMore && memos.length > 0 && (
        <div className="text-center py-8">
          <div className="text-base-content/40 text-sm">已显示全部 {memos.length} 条闪念</div>
        </div>
      )}
    </div>
  );
}
