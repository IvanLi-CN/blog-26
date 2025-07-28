import { useEffect, useState } from 'react';
import { VectorizationStatus } from '~/components/common/VectorizationStatus';
import { trpc } from '~/lib/trpc-client';
import { AttachmentGrid } from './AttachmentGrid';
import CommentCountWithProvider from './CommentCountWithProvider';
import { useInfiniteScroll, useMemos } from './hooks';
import { MemoEditor } from './MemoEditor';
import MemoReactionStatsWithProvider from './MemoReactionStatsWithProvider';
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
  memosHook?: ReturnType<typeof useMemos>;
}

export function MemosList({ isAdmin = false, initialMemos, initialPagination, memosHook }: MemosListProps) {
  // 水合状态检查
  const [isHydrated, setIsHydrated] = useState(false);
  // 跟踪当前正在删除的闪念 slug
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  // 删除确认对话框状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; slug: string; title?: string }>({
    show: false,
    slug: '',
    title: '',
  });
  // 错误提示对话框状态
  const [errorDialog, setErrorDialog] = useState<{ show: boolean; message: string }>({
    show: false,
    message: '',
  });
  // 编辑抽屉状态
  const [editDrawer, setEditDrawer] = useState<{ show: boolean; memo: any | null }>({
    show: false,
    memo: null,
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // 使用传入的 memosHook 或创建新的
  const defaultMemosHook = useMemos({
    isAdmin,
    initialMemos,
    initialPagination,
  });

  const { memos, isLoading, isLoadingMore, error, hasMore, loadMore, removeMemoFromLocal } =
    memosHook || defaultMemosHook;

  // 启用无限滚动
  useInfiniteScroll(loadMore, hasMore, isLoadingMore);

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 删除 Memo 的 mutation
  const deleteMemoMutation = trpc.memos.delete.useMutation({
    onMutate: (variables) => {
      // 设置当前正在删除的闪念
      setDeletingSlug(variables.slug);
    },
    onSuccess: (_, variables) => {
      // 立即从本地状态中移除被删除的闪念，提供更好的用户体验
      removeMemoFromLocal(variables.slug);

      // 使查询缓存失效，确保下次加载时数据是最新的
      utils.memos.getMemos.invalidate();

      // 清除删除状态
      setDeletingSlug(null);
      // 关闭确认对话框
      setDeleteConfirm({ show: false, slug: '', title: '' });
    },
    onError: (error, variables) => {
      // 显示错误对话框
      setErrorDialog({ show: true, message: `删除失败: ${error.message}` });
      // 清除删除状态
      setDeletingSlug(null);
      // 关闭确认对话框
      setDeleteConfirm({ show: false, slug: '', title: '' });
    },
  });

  const handleDeleteClick = (slug: string) => {
    const memo = memos.find((m) => m.slug === slug);
    setDeleteConfirm({
      show: true,
      slug,
      title: memo?.title || '这条 Memo',
    });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.slug) {
      deleteMemoMutation.mutate({ slug: deleteConfirm.slug });
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirm({ show: false, slug: '', title: '' });
  };

  const handleCloseError = () => {
    setErrorDialog({ show: false, message: '' });
  };

  const handleEditClick = (slug: string) => {
    // 找到要编辑的memo
    const memo = memos.find((m) => m.slug === slug);
    if (memo) {
      setEditDrawer({ show: true, memo });
      // 禁止背景滚动
      document.body.style.overflow = 'hidden';
    }
  };

  const handleCloseEditDrawer = () => {
    setEditDrawer({ show: false, memo: null });
    // 恢复背景滚动
    document.body.style.overflow = '';
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
              {/* 可点击的卡片内容 */}
              <div
                className="block cursor-pointer"
                onMouseDown={(e) => {
                  // 记录鼠标按下的位置
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const startTime = Date.now();

                  const handleMouseUp = (upEvent: MouseEvent) => {
                    // 移除事件监听器
                    document.removeEventListener('mouseup', handleMouseUp);

                    // 计算鼠标移动距离和时间
                    const deltaX = Math.abs(upEvent.clientX - startX);
                    const deltaY = Math.abs(upEvent.clientY - startY);
                    const deltaTime = Date.now() - startTime;

                    // 检查是否是文本选择（移动距离大于阈值或时间过长）
                    const isTextSelection = deltaX > 5 || deltaY > 5 || deltaTime > 500;

                    // 检查是否有文本被选中
                    const hasSelection = (window.getSelection()?.toString().length ?? 0) > 0;

                    // 检查是否点击了可交互元素
                    const target = upEvent.target as HTMLElement;
                    const isInteractiveElement = target.closest('button, a, .badge, [role="button"]');

                    // 只有在没有文本选择、没有点击交互元素、且是简单点击时才导航
                    if (!isTextSelection && !hasSelection && !isInteractiveElement) {
                      window.location.href = `/memos/${memo.slug}`;
                    }
                  };

                  // 添加鼠标松开事件监听器
                  document.addEventListener('mouseup', handleMouseUp);
                }}
              >
                {/* 头部信息 */}
                <div className="flex items-center justify-between px-6 py-3 bg-base-200 border-b border-base-300 gap-4">
                  {/* 左侧：时间信息 */}
                  <div className="flex items-center space-x-3 text-sm text-base-content/70 min-w-0 flex-shrink">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span title={formatFullDate(memo.createdAt)} className="cursor-help truncate">
                      {formatDate(memo.createdAt)}
                    </span>
                    {memo.updatedAt !== memo.createdAt && (
                      <>
                        <span className="text-base-content/40 flex-shrink-0">•</span>
                        <span title={formatFullDate(memo.updatedAt)} className="cursor-help flex-shrink-0">
                          已编辑
                        </span>
                      </>
                    )}
                  </div>

                  {/* 右侧：状态和操作按钮 */}
                  <div className="flex items-center space-x-2 flex-shrink-0">
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
                            <span className="hidden sm:inline">公开</span>
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
                            <span className="hidden sm:inline">私有</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 管理员操作按钮组 */}
                    {isAdmin && (
                      <div className="flex items-center space-x-1">
                        {/* 编辑按钮 */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditClick(memo.slug);
                          }}
                          disabled={!isHydrated}
                          className="btn btn-ghost btn-xs btn-circle text-primary hover:bg-primary/10"
                          title={!isHydrated ? '正在加载...' : '编辑'}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>

                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteClick(memo.slug);
                          }}
                          disabled={!isHydrated || deletingSlug === memo.slug}
                          className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/10"
                          title={!isHydrated ? '正在加载...' : deletingSlug === memo.slug ? '删除中...' : '删除'}
                        >
                          {!isHydrated || deletingSlug === memo.slug ? (
                            <span className="loading loading-spinner loading-xs"></span>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          )}
                        </button>
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

                  {/* 表情反应统计 */}
                  <div className="mt-3">
                    <MemoReactionStatsWithProvider memoSlug={memo.slug} />
                  </div>
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
              </div>
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

      {/* 删除确认对话框 */}
      {deleteConfirm.show && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">确认删除</h3>
            <p className="py-4">
              您确定要删除 "<span className="font-semibold">{deleteConfirm.title}</span>" 吗？
            </p>
            <p className="text-sm text-warning mb-4">⚠️ 此操作不可撤销，Memo 将被永久删除。</p>
            <div className="modal-action">
              <button
                onClick={handleConfirmDelete}
                disabled={deletingSlug === deleteConfirm.slug}
                className="btn btn-error"
              >
                {deletingSlug === deleteConfirm.slug ? (
                  <>
                    <span className="loading loading-spinner loading-xs mr-2"></span>
                    删除中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    确认删除
                  </>
                )}
              </button>
              <button onClick={handleCancelDelete} disabled={deletingSlug === deleteConfirm.slug} className="btn">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示对话框 */}
      {errorDialog.show && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-error">操作失败</h3>
            <p className="py-4">{errorDialog.message}</p>
            <div className="modal-action">
              <button onClick={handleCloseError} className="btn">
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑抽屉 */}
      {editDrawer.show && (
        <>
          {/* 遮罩层 */}
          <div className="fixed inset-0 bg-black/30 z-40" onClick={handleCloseEditDrawer} />

          {/* 抽屉内容 */}
          <div className="fixed top-0 left-0 right-0 bg-base-100 shadow-xl z-50 transform transition-transform duration-300 ease-in-out h-[80vh] flex flex-col">
            <div className="container mx-auto px-6 py-4 max-w-4xl h-full flex flex-col">
              {/* 抽屉头部 */}
              <div className="flex items-center justify-between mb-4 border-b border-base-300 pb-4 flex-shrink-0">
                <h3 className="text-lg font-semibold">编辑 Memo</h3>
                <button
                  onClick={handleCloseEditDrawer}
                  className="btn btn-ghost btn-sm btn-circle"
                  aria-label="关闭编辑器"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 编辑器内容 */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {editDrawer.memo && (
                  <MemoEditor
                    memo={editDrawer.memo}
                    onSave={(updatedMemo) => {
                      // 更新本地状态
                      if (memosHook?.addMemoToLocal) {
                        // 先移除旧的，再添加新的
                        removeMemoFromLocal(editDrawer.memo.slug);
                        memosHook.addMemoToLocal(updatedMemo);
                      }
                      handleCloseEditDrawer();
                    }}
                    onCancel={handleCloseEditDrawer}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
