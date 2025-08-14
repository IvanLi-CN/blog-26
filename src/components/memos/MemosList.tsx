"use client";

/**
 * Memo 列表组件
 *
 * 支持多源数据展示、无限滚动分页、时间线样式
 */

import { format, isThisMonth, isThisWeek, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar, ChevronDown, Grid3X3, List, Plus, RefreshCw, Search, Tag } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { MemoCard, type MemoCardData } from "./MemoCard";

export interface MemosListProps {
  /** Memo 数据 */
  memos: MemoCardData[];
  /** 是否正在加载 */
  loading?: boolean;
  /** 是否有更多数据 */
  hasMore?: boolean;
  /** 加载更多回调 */
  onLoadMore?: () => void;
  /** 搜索回调 */
  onSearch?: (query: string) => void;
  /** 标签过滤回调 */
  onTagFilter?: (tag: string | null) => void;
  /** 刷新回调 */
  onRefresh?: () => void;
  /** 新建回调 */
  onNew?: () => void;
  /** 编辑回调 */
  onEdit?: (memo: MemoCardData) => void;
  /** 删除回调 */
  onDelete?: (memo: MemoCardData) => void;
  /** 点击回调 */
  onMemoClick?: (memo: MemoCardData) => void;
  /** 是否显示管理按钮 */
  showManageButtons?: boolean;
  /** 视图模式 */
  viewMode?: "list" | "grid" | "timeline";
  /** 样式类名 */
  className?: string;
}

type GroupedMemos = {
  [key: string]: MemoCardData[];
};

export function MemosList({
  memos,
  loading = false,
  hasMore = false,
  onLoadMore,
  onSearch,
  onTagFilter,
  onRefresh,
  onNew,
  onEdit,
  onDelete,
  onMemoClick,
  showManageButtons = false,
  viewMode = "timeline",
  className,
}: MemosListProps) {
  // 状态管理
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentViewMode, setCurrentViewMode] = useState(viewMode);

  // 处理搜索
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      onSearch?.(query);
    },
    [onSearch]
  );

  // 处理标签过滤
  const handleTagFilter = useCallback(
    (tag: string | null) => {
      setSelectedTag(tag);
      onTagFilter?.(tag);
    },
    [onTagFilter]
  );

  // 获取所有标签
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    memos.forEach((memo) => {
      memo.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [memos]);

  // 按时间分组 memo
  const groupedMemos = useMemo((): GroupedMemos => {
    if (currentViewMode !== "timeline") {
      return { "所有 Memo": memos };
    }

    const groups: GroupedMemos = {};

    memos.forEach((memo) => {
      try {
        const date = new Date(memo.createdAt);
        let groupKey: string;

        if (isToday(date)) {
          groupKey = "今天";
        } else if (isYesterday(date)) {
          groupKey = "昨天";
        } else if (isThisWeek(date)) {
          groupKey = "本周";
        } else if (isThisMonth(date)) {
          groupKey = "本月";
        } else {
          groupKey = format(date, "yyyy年MM月", { locale: zhCN });
        }

        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(memo);
      } catch {
        // 如果日期解析失败，放到"其他"分组
        if (!groups.其他) {
          groups.其他 = [];
        }
        groups.其他.push(memo);
      }
    });

    return groups;
  }, [memos, currentViewMode]);

  // 渲染加载骨架
  const renderSkeleton = () => (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={`skeleton-${index}`} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ))}
    </div>
  );

  // 渲染空状态
  const renderEmpty = () => (
    <div className="text-center py-12">
      <div className="text-muted-foreground mb-4">
        {searchQuery || selectedTag ? "没有找到匹配的 memo" : "还没有任何 memo"}
      </div>
      {onNew && (
        <Button onClick={onNew}>
          <Plus className="w-4 h-4 mr-2" />
          创建第一个 Memo
        </Button>
      )}
    </div>
  );

  return (
    <div className={cn("memos-list space-y-4", className)}>
      {/* 头部工具栏 */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* 搜索框 */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索 memo..."
            className="pl-10"
          />
        </div>

        {/* 工具按钮 */}
        <div className="flex items-center space-x-2">
          {/* 标签过滤 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Tag className="w-4 h-4 mr-2" />
                {selectedTag || "标签"}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleTagFilter(null)}>所有标签</DropdownMenuItem>
              <DropdownMenuSeparator />
              {allTags.map((tag) => (
                <DropdownMenuItem key={tag} onClick={() => handleTagFilter(tag)}>
                  #{tag}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 视图模式切换 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {currentViewMode === "timeline" && <Calendar className="w-4 h-4" />}
                {currentViewMode === "grid" && <Grid3X3 className="w-4 h-4" />}
                {currentViewMode === "list" && <List className="w-4 h-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setCurrentViewMode("timeline")}>
                <Calendar className="w-4 h-4 mr-2" />
                时间线
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrentViewMode("grid")}>
                <Grid3X3 className="w-4 h-4 mr-2" />
                网格
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrentViewMode("list")}>
                <List className="w-4 h-4 mr-2" />
                列表
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 刷新按钮 */}
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}

          {/* 新建按钮 */}
          {onNew && (
            <Button size="sm" onClick={onNew}>
              <Plus className="w-4 h-4 mr-2" />
              新建
            </Button>
          )}
        </div>
      </div>

      {/* 过滤器状态 */}
      {(searchQuery || selectedTag) && (
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">筛选条件:</span>
          {searchQuery && (
            <Badge variant="secondary">
              搜索: {searchQuery}
              <button
                type="button"
                onClick={() => handleSearch("")}
                className="ml-1 hover:text-red-500"
              >
                ×
              </button>
            </Badge>
          )}
          {selectedTag && (
            <Badge variant="secondary">
              标签: #{selectedTag}
              <button
                type="button"
                onClick={() => handleTagFilter(null)}
                className="ml-1 hover:text-red-500"
              >
                ×
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* 内容区域 */}
      {loading && memos.length === 0 ? (
        renderSkeleton()
      ) : memos.length === 0 ? (
        renderEmpty()
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMemos).map(([groupKey, groupMemos]) => (
            <div key={groupKey} className="space-y-3">
              {/* 分组标题 */}
              {currentViewMode === "timeline" && (
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-muted-foreground">{groupKey}</h3>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{groupMemos.length} 个</span>
                </div>
              )}

              {/* Memo 列表 */}
              <div
                className={cn(
                  currentViewMode === "grid" &&
                    "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
                  currentViewMode === "list" && "space-y-2",
                  currentViewMode === "timeline" && "space-y-3"
                )}
              >
                {groupMemos.map((memo) => (
                  <MemoCard
                    key={memo.id}
                    memo={memo}
                    compact={currentViewMode === "list"}
                    showEditButton={showManageButtons}
                    showDeleteButton={showManageButtons}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onClick={onMemoClick}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* 加载更多 */}
          {hasMore && (
            <div className="text-center py-4">
              <Button variant="outline" onClick={onLoadMore} disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    加载中...
                  </>
                ) : (
                  "加载更多"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
