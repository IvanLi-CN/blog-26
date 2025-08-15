"use client";

/**
 * Memo 卡片组件
 *
 * 完全匹配旧项目 (Astro) 的时间线样式 memo 卡片
 *
 * 主要特点：
 * - 时间线圆点：渐变色圆形，带编辑笔图标和阴影环形
 * - 时间线连接线：渐变透明效果，正确定位
 * - DaisyUI 卡片样式：悬停阴影效果
 * - 头部信息栏：时间显示、公开/私有状态、管理员操作按钮
 * - 内容区域：Markdown 渲染、标签显示
 * - 响应式设计：手机端隐藏时间线，调整间距和字体大小
 * - 复杂的点击交互逻辑：避免与文本选择冲突
 */

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";

export interface MemoCardProps {
  /** Memo 数据 */
  memo: MemoCardData;
  /** 是否为紧凑模式 */
  compact?: boolean;
  /** 是否显示编辑按钮 */
  showEditButton?: boolean;
  /** 是否显示删除按钮 */
  showDeleteButton?: boolean;
  /** 最大内容长度（超出显示省略号） */
  maxContentLength?: number;
  /** 编辑回调 */
  onEdit?: (memo: MemoCardData) => void;
  /** 删除回调 */
  onDelete?: (memo: MemoCardData) => void;
  /** 点击回调 */
  onClick?: (memo: MemoCardData) => void;
  /** 样式类名 */
  className?: string;
  /** 是否为最后一个（用于时间线连接线） */
  isLast?: boolean;
  /** 索引（用于时间线样式） */
  index?: number;
}

export interface MemoCardData {
  id: string;
  slug: string;
  title?: string;
  content: string;
  excerpt?: string;
  isPublic: boolean;
  tags: string[];
  author?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  attachments?: Array<{
    filename: string;
    path: string;
    isImage: boolean;
  }>;
}

export function MemoCard({
  memo,
  compact = false,
  showEditButton = false,
  showDeleteButton = false,
  maxContentLength = 300,
  onEdit,
  onDelete,
  onClick,
  className,
  isLast = false,
  index = 0,
}: MemoCardProps) {
  const [_isExpanded, _setIsExpanded] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  // 处理内容截断
  const displayContent = memo.content || memo.excerpt || "";
  const shouldTruncate = displayContent.length > maxContentLength && !showFullContent;
  const truncatedContent = shouldTruncate
    ? `${displayContent.substring(0, maxContentLength)}...`
    : displayContent;

  // 格式化时间 - 使用 useMemo 优化性能
  const formattedDate = useMemo(() => {
    try {
      const date = new Date(memo.createdAt);
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
    } catch {
      return "未知时间";
    }
  }, [memo.createdAt]);

  // 完整日期格式 - 用于悬浮提示
  const fullDate = useMemo(() => {
    try {
      const date = new Date(memo.createdAt);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return memo.createdAt;
    }
  }, [memo.createdAt]);

  // 更新时间格式
  const fullUpdatedDate = useMemo(() => {
    if (!memo.updatedAt || memo.updatedAt === memo.createdAt) return null;
    try {
      const date = new Date(memo.updatedAt);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return memo.updatedAt;
    }
  }, [memo.updatedAt, memo.createdAt]);

  // 处理编辑
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onEdit?.(memo);
    },
    [memo, onEdit]
  );

  // 处理删除
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(`确定要删除 "${memo.title || '这条 Memo'}" 吗？\n\n⚠️ 此操作不可撤销，Memo 将被永久删除。`)) {
        onDelete?.(memo);
      }
    },
    [memo, onDelete]
  );

  return (
    <div className="relative" data-testid="memo-item">
      {/* 时间线连接线 - 完全匹配旧项目 */}
      {!isLast && (
        <div className="absolute left-4 sm:left-5 top-10 sm:top-12 w-0.5 h-full bg-gradient-to-b from-primary/30 to-transparent -z-10 hidden sm:block"></div>
      )}

      {/* Memo 卡片 - 完全匹配旧项目的布局 */}
      <div className="flex items-start space-x-0 sm:space-x-5">
        {/* 时间线圆点 - 完全匹配旧项目 */}
        <div
          className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-primary/80 rounded-full items-center justify-center shadow-lg ring-2 sm:ring-4 ring-base-100 hidden sm:flex"
          aria-label={`Memo 发布于 ${formattedDate}`}
          role="img"
        >
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </div>

        {/* Memo 内容 - 完全匹配旧项目 */}
        <div className="flex-1 card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-200 overflow-hidden relative">
          {/* 可点击的卡片内容 */}
          <div
            className="block cursor-pointer"
            onMouseDown={(e) => {
              // 记录鼠标按下的位置 - 匹配旧项目的交互逻辑
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
                const isInteractiveElement = target.closest(
                  'button, a, .badge, [role="button"], .group\\/image, img[alt*=".jpg"], img[alt*=".png"], img[alt*=".jpeg"], img[alt*=".gif"], img[alt*=".webp"]'
                );

                // 只有在没有文本选择、没有点击交互元素、且是简单点击时才导航
                if (!isTextSelection && !hasSelection && !isInteractiveElement) {
                  window.location.href = `/memos/${memo.slug}`;
                }
              };

              // 添加鼠标松开事件监听器
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            {/* 头部信息 - 完全匹配旧项目 */}
            <div className="flex items-center justify-between px-4 py-2 sm:px-6 sm:py-3 bg-base-200 border-b border-base-300 gap-2 sm:gap-4">
              {/* 左侧：时间信息 */}
              <div className="flex items-center space-x-2 sm:space-x-3 text-xs sm:text-sm text-base-content/70 min-w-0 flex-shrink">
                <svg
                  className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span
                  title={fullDate}
                  className="cursor-help truncate"
                  data-testid="memo-time"
                >
                  {formattedDate}
                </span>
                {fullUpdatedDate && (
                  <>
                    <span className="text-base-content/40 flex-shrink-0">•</span>
                    <span title={fullUpdatedDate} className="cursor-help flex-shrink-0">
                      已编辑
                    </span>
                  </>
                )}
              </div>

              {/* 右侧：状态和操作按钮 */}
              <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                {/* 公开/私有状态指示器 */}
                <div className="flex items-center">
                  {memo.isPublic ? (
                    <div className="badge badge-info badge-xs sm:badge-sm gap-1" data-testid="public-indicator">
                      <svg
                        className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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
                    <div
                      className="badge badge-warning badge-xs sm:badge-sm gap-1"
                      data-testid="private-indicator"
                    >
                      <svg
                        className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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

                {/* 管理员操作按钮组 */}
                {(showEditButton || showDeleteButton) && (
                  <div className="flex items-center space-x-0.5 sm:space-x-1">
                    {/* 编辑按钮 */}
                    {showEditButton && (
                      <button
                        onClick={handleEditClick}
                        className="btn btn-ghost btn-xs btn-circle text-info hover:bg-info/10"
                        title={`编辑 Memo: ${memo.title || '无标题'}`}
                        aria-label={`编辑 Memo: ${memo.title || '无标题'}`}
                      >
                        <svg
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                    )}

                    {/* 删除按钮 */}
                    {showDeleteButton && (
                      <button
                        onClick={handleDeleteClick}
                        className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/10"
                        title={`删除 Memo: ${memo.title || '无标题'}`}
                        aria-label={`删除 Memo: ${memo.title || '无标题'}`}
                      >
                        <svg
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Memo 内容 - 完全匹配旧项目 */}
            <div className="card-body px-4 py-3 sm:px-6 sm:py-4">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    // 限制标题层级
                    h1: ({ children }) => <h4 className="text-base font-medium">{children}</h4>,
                    h2: ({ children }) => <h5 className="text-sm font-medium">{children}</h5>,
                    h3: ({ children }) => <h6 className="text-sm font-medium">{children}</h6>,
                    // 限制图片大小
                    img: ({ src, alt }) => (
                      <img
                        src={src}
                        alt={alt}
                        className="max-w-full h-auto max-h-32 object-cover rounded"
                      />
                    ),
                  }}
                >
                  {truncatedContent}
                </ReactMarkdown>
              </div>

              {/* 展开/收起按钮 */}
              {shouldTruncate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFullContent(!showFullContent);
                  }}
                  className="text-xs text-primary hover:text-primary/80 mt-2"
                >
                  {showFullContent ? "收起" : "展开"}
                </button>
              )}

              {/* 标签显示 - 完全匹配旧项目 */}
              {memo.tags && memo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 sm:mt-3">
                  {memo.tags.map((tag: string, index: number) => (
                    <span key={index} className="badge badge-outline badge-sm">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
