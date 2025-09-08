"use client";

/**
 * Memo 详情页面组件
 *
 * 展示单个 memo 的详细内容，支持编辑功能
 */

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  Lock,
  MoreHorizontal,
  Share2,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { SITE } from "../../config/site";
import { useAuth } from "../../hooks/useAuth";
import { detectContentAnomalies } from "../../lib/content-anomalies";
import { trpc } from "../../lib/trpc";
import { cn } from "../../lib/utils";
import MarkdownRenderer from "../common/MarkdownRenderer";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import AnomalyIndicator from "./AnomalyIndicator";
import type { MemoCardData } from "./MemoCard";
import { type MemoData, MemoEditor } from "./MemoEditor";

export interface MemoDetailPageProps {
  /** Memo slug */
  slug: string;
  /** 初始数据（SSR） */
  initialData?: MemoCardData;
  /** 是否显示编辑功能 */
  showEditFeatures?: boolean;
  /** 样式类名 */
  className?: string;
}

export function MemoDetailPage({
  slug,
  initialData: _initialData,
  showEditFeatures = false,
  className,
}: MemoDetailPageProps) {
  const router = useRouter();
  const { isAdmin } = useAuth();

  // 状态管理
  const [isEditing, setIsEditing] = useState(false);

  // 获取 memo 数据
  const {
    data: memo,
    isLoading,
    isError,
    refetch,
  } = trpc.memos.bySlug.useQuery(
    { slug },
    {
      refetchOnMount: false,
    }
  );

  // 更新 memo
  const updateMemo = trpc.memos.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      refetch();
    },
    onError: (error) => {
      console.error("更新失败:", error);
    },
  });

  // 删除 memo
  const deleteMemo = trpc.memos.delete.useMutation({
    onSuccess: () => {
      router.push("/memos");
    },
    onError: (error) => {
      console.error("删除失败:", error);
    },
  });

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

  // 处理编辑保存
  const handleSave = useCallback(
    async (data: MemoData) => {
      if (!memo) return;

      await updateMemo.mutateAsync({
        id: memo.id,
        content: data.content,
        title: data.title,
        isPublic: data.isPublic,
        tags: data.tags,
        attachments: [], // TODO: 处理附件
      });
    },
    [memo, updateMemo]
  );

  // 处理删除
  const handleDelete = useCallback(async () => {
    if (!memo || !confirm("确定要删除这个 memo 吗？")) return;

    await deleteMemo.mutateAsync({ id: memo.id });
  }, [memo, deleteMemo]);

  // 处理分享
  const handleShare = useCallback(async () => {
    if (!memo) return;

    try {
      const url = `${window.location.origin}/memos/${memo.slug}`;
      await navigator.clipboard.writeText(url);
      // 这里可以添加成功提示
    } catch (error) {
      console.error("复制链接失败:", error);
    }
  }, [memo]);

  // 处理返回
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // 加载状态
  if (isLoading) {
    return (
      <div className={cn("memo-detail-page", className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/4" />
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (isError || !memo) {
    return (
      <div className={cn("memo-detail-page", className)}>
        <div className="alert alert-error max-w-md mx-auto my-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>加载失败，请稍后重试</span>
        </div>
        <div className="text-center">
          <Button onClick={handleBack}>返回</Button>
        </div>
      </div>
    );
  }

  // 编辑模式
  if (isEditing) {
    return (
      <div className={cn("memo-detail-page", className)}>
        <MemoEditor
          initialContent={memo.content}
          initialTitle={memo.title}
          initialIsPublic={memo.isPublic}
          initialTags={memo.tags}
          isEditing={true}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
          showAdvancedOptions
        />
      </div>
    );
  }

  // 详情展示模式
  return (
    <div className={cn("memo-detail-page", className)}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={handleBack} className="flex items-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </Button>

        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleShare} className="flex items-center space-x-2">
            <Share2 className="w-4 h-4" />
            <span>分享</span>
          </Button>

          {showEditFeatures && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit3 className="w-4 h-4 mr-2" />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShare}>
                  <Copy className="w-4 h-4 mr-2" />
                  复制链接
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(`/memos/${memo.slug}`, "_blank")}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  在新窗口打开
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* 标题和元信息 */}
      <div className="mb-6">
        {memo.title && (
          <div className="mb-2">
            <h1 className="text-3xl font-bold">{memo.title}</h1>
          </div>
        )}

        <div className="flex items-center text-sm text-muted-foreground mb-4 gap-4">
          <div className="flex items-center space-x-2">
            <Avatar className="w-6 h-6">
              <AvatarFallback className="text-xs">
                {memo.author?.charAt(0)?.toUpperCase() || "M"}
              </AvatarFallback>
            </Avatar>
            <span>{memo.author || SITE.author.name}</span>
          </div>

          <div className="flex items-center space-x-1">
            <Calendar className="w-4 h-4" />
            <span>{formatTime(memo.createdAt)}</span>
          </div>

          <div className="flex items-center space-x-1">
            {memo.isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>{memo.isPublic ? "公开" : "私有"}</span>
          </div>

          {/* 右侧放置异常数据提示（仅管理员可见） */}
          {(() => {
            const anomalies = detectContentAnomalies(memo.content || "");
            return isAdmin && anomalies.hasInlineDataImages ? (
              <div className="ml-auto">
                <AnomalyIndicator anomalies={anomalies} showLabel={true} />
              </div>
            ) : (
              <div className="ml-auto" />
            );
          })()}
        </div>

        {/* 标签 */}
        {memo.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {memo.tags.map((tag: string) => (
              <Badge key={tag} variant="secondary">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* 内容 */}
      <div>
        <MarkdownRenderer
          content={memo.content}
          variant="memo"
          enableMath={true}
          enableMermaid={true}
          enableCodeFolding={true}
          enableImageLightbox={true}
          maxCodeLines={30}
          previewCodeLines={20}
          articlePath={`/memos/${memo.slug}`}
          contentSource={memo.source === "local" ? "local" : "webdav"}
          removeTags={true}
          className="prose prose-lg max-w-none"
        />
      </div>

      {/* 附件 */}
      {memo.attachments && memo.attachments.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-medium mb-4">附件</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {memo.attachments.map(
              (attachment: { path: string; filename: string; isImage: boolean }) => (
                <div key={attachment.path} className="border rounded-lg p-3">
                  {attachment.isImage ? (
                    // biome-ignore lint/performance/noImgElement: Simple attachment thumbnail
                    <img
                      src={attachment.path}
                      alt={attachment.filename}
                      className="w-full h-24 object-cover rounded mb-2"
                    />
                  ) : (
                    <div className="w-full h-24 bg-muted rounded mb-2 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">
                        {attachment.filename.split(".").pop()?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <p className="text-xs truncate">{attachment.filename}</p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
