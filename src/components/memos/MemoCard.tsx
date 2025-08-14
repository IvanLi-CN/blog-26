"use client";

/**
 * Memo 卡片组件
 *
 * 用于展示单个 memo，支持预览和编辑切换
 */

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Calendar,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  Lock,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "../ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

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
}: MemoCardProps) {
  const [_isExpanded, _setIsExpanded] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  // 处理内容截断
  const displayContent = memo.content || memo.excerpt || "";
  const shouldTruncate = displayContent.length > maxContentLength && !showFullContent;
  const truncatedContent = shouldTruncate
    ? `${displayContent.substring(0, maxContentLength)}...`
    : displayContent;

  // 格式化时间
  const formatTime = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, {
        addSuffix: true,
        locale: zhCN,
      });
    } catch {
      return "未知时间";
    }
  }, []);

  // 处理卡片点击
  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // 如果点击的是按钮或链接，不触发卡片点击
      if ((e.target as HTMLElement).closest("button, a")) {
        return;
      }
      onClick?.(memo);
    },
    [memo, onClick]
  );

  // 处理编辑
  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(memo);
    },
    [memo, onEdit]
  );

  // 处理删除
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("确定要删除这个 memo 吗？")) {
        onDelete?.(memo);
      }
    },
    [memo, onDelete]
  );

  // 处理复制链接
  const handleCopyLink = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const url = `${window.location.origin}/memos/${memo.slug}`;
        await navigator.clipboard.writeText(url);
        // 这里可以添加成功提示
      } catch (error) {
        console.error("复制链接失败:", error);
      }
    },
    [memo.slug]
  );

  // 处理在新窗口打开
  const handleOpenInNewTab = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      window.open(`/memos/${memo.slug}`, "_blank");
    },
    [memo.slug]
  );

  return (
    <Card
      className={cn(
        "memo-card transition-all duration-200 hover:shadow-md",
        onClick && "cursor-pointer hover:bg-accent/50",
        compact && "p-2",
        className
      )}
      onClick={handleCardClick}
    >
      {/* 头部 */}
      <CardHeader className={cn("pb-2", compact && "p-2 pb-1")}>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {/* 作者头像 */}
            <Avatar className="w-6 h-6">
              <AvatarFallback className="text-xs">
                {memo.author?.charAt(0)?.toUpperCase() || "M"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              {/* 标题 */}
              {memo.title && <h3 className="font-medium text-sm truncate">{memo.title}</h3>}

              {/* 元信息 */}
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <span>{memo.author || "匿名"}</span>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formatTime(memo.createdAt)}</span>
                </span>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  {memo.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>{memo.isPublic ? "公开" : "私有"}</span>
                </span>
              </div>
            </div>
          </div>

          {/* 操作菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleOpenInNewTab}>
                <ExternalLink className="w-4 h-4 mr-2" />
                在新窗口打开
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyLink}>
                <Copy className="w-4 h-4 mr-2" />
                复制链接
              </DropdownMenuItem>
              {showEditButton && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleEdit}>
                    <Edit3 className="w-4 h-4 mr-2" />
                    编辑
                  </DropdownMenuItem>
                </>
              )}
              {showDeleteButton && (
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      {/* 内容 */}
      <CardContent className={cn("py-2", compact && "p-2 py-1")}>
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
          <Button
            variant="link"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowFullContent(!showFullContent);
            }}
            className="p-0 h-auto text-xs mt-2"
          >
            {showFullContent ? "收起" : "展开"}
          </Button>
        )}
      </CardContent>

      {/* 底部 */}
      <CardFooter className={cn("pt-2", compact && "p-2 pt-1")}>
        <div className="flex items-center justify-between w-full">
          {/* 标签 */}
          <div className="flex flex-wrap gap-1">
            {memo.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {memo.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{memo.tags.length - 3}
              </Badge>
            )}
          </div>

          {/* 快速操作 */}
          <div className="flex items-center space-x-1">
            {showEditButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="h-6 w-6 p-0"
                title="编辑"
              >
                <Edit3 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
