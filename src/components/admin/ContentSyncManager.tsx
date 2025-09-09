"use client";

/**
 * 内容同步管理组件
 *
 * 提供内容源状态显示、手动同步控制和日志查看功能
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "../../lib/trpc";
import Icon from "../ui/Icon";

// 添加自定义CSS动画
const logAnimationStyles = `
  @keyframes slideInFromBottom {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .log-entry-animation {
    animation: slideInFromBottom 300ms ease-out forwards;
  }
`;

interface SyncProgress {
  status: string;
  progress: number;
  currentStep: string;
  processedItems: number;
  totalItems: number;
  startTime: number;
  error?: string;
}

interface SourceStatus {
  name: string;
  type: string;
  priority: number;
  enabled: boolean;
  online: boolean;
  totalItems: number;
  lastSync?: number;
  error?: string;
}

interface SyncLog {
  id: string;
  sourceName: string;
  operation: string;
  status: string;
  message: string;
  filePath?: string | null;
  createdAt: number;
}

export function ContentSyncManager() {
  const [isLoading, setIsLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [sourcesStatus, setSourcesStatus] = useState<SourceStatus[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [showLogs, setShowLogs] = useState(true); // 默认展开日志
  const [autoScroll, setAutoScroll] = useState(true); // 自动滚动状态
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set()); // 新日志的ID集合，用于控制进场动画

  // 日志容器的引用
  const logContainerRef = useRef<HTMLDivElement>(null);
  const mobileLogContainerRef = useRef<HTMLDivElement>(null);
  const previousLogCountRef = useRef<number>(0); // 记录上次的日志数量

  // tRPC utils
  const _utils = trpc.useUtils();

  // API 查询
  const { data: systemConfig } = trpc.admin.contentSync.getSystemConfig.useQuery();
  const { data: managerStats, refetch: refetchStats } =
    trpc.admin.contentSync.getManagerStats.useQuery();
  const { data: contentStats, refetch: refetchContentStats } =
    trpc.admin.contentSync.getContentStats.useQuery();

  // 向量化统计
  const { data: vectorStats, refetch: refetchVectorStats } =
    trpc.admin.vectorize.getVectorizationStats.useQuery();

  // API 变更
  const triggerSyncMutation = trpc.admin.contentSync.triggerSync.useMutation({
    onSuccess: async (result) => {
      console.log(`同步完成！处理了 ${result.stats.totalProcessed} 个项目`);
      // 注意：不在这里设置 setIsLoading(false)，因为我们通过 tRPC subscription 接收完成事件
      refetchStats();
      refetchContentStats(); // 刷新统计信息
      refreshData();
    },
    onError: (error) => {
      console.error(`同步失败: ${error.message}`);
      setIsLoading(false);
    },
  });

  const cancelSyncMutation = trpc.admin.contentSync.cancelSync.useMutation({
    onSuccess: () => {
      console.log("同步已取消");
      setIsLoading(false);
      setSyncProgress(null);
    },
    onError: (error) => {
      console.error(`取消同步失败: ${error.message}`);
    },
  });

  // 向量化触发
  const triggerVectorize = trpc.admin.vectorize.triggerVectorize.useMutation({
    onSuccess: async () => {
      await refetchVectorStats();
    },
  });

  // 使用 tRPC 查询
  const { data: sourcesData, refetch: refetchSources } =
    trpc.admin.contentSync.getSourcesStatus.useQuery();

  const { data: progressData, refetch: refetchProgress } =
    trpc.admin.contentSync.getSyncProgress.useQuery();

  // 刷新数据
  const refreshData = useCallback(async () => {
    try {
      await Promise.all([refetchSources(), refetchProgress(), refetchContentStats()]);
    } catch (error) {
      console.error("刷新数据失败:", error);
    }
  }, [refetchSources, refetchProgress, refetchContentStats]);

  // tRPC subscription 用于接收实时日志
  trpc.admin.contentSync.subscribeSyncLogs.useSubscription(undefined, {
    onData: (event: unknown) => {
      console.log("收到订阅事件:", event);

      // 类型守卫：确保 event 是我们期望的格式
      if (typeof event === "object" && event !== null && "type" in event) {
        const typedEvent = event as { type: string; data: unknown };

        switch (typedEvent.type) {
          case "connected":
            console.log("tRPC 订阅连接确认:", (typedEvent.data as { message: string }).message);
            break;

          case "sync:start":
            console.log("同步开始:", typedEvent.data);
            // 清空旧日志，准备接收新的同步日志
            setSyncLogs([]);
            break;

          case "sync:log": {
            const logData = typedEvent.data as {
              id: string;
              sourceType: string;
              sourceName: string;
              operation: string;
              status: string;
              message: string;
              filePath?: string;
              data?: unknown;
              createdAt: number;
            };
            console.log("收到同步日志:", logData);

            // 添加新日志到列表
            setSyncLogs((prev) => [
              ...prev,
              {
                id: logData.id,
                sourceType: logData.sourceType,
                sourceName: logData.sourceName,
                operation: logData.operation,
                status: logData.status,
                message: logData.message,
                filePath: logData.filePath,
                data: logData.data,
                createdAt: logData.createdAt,
              },
            ]);

            // 标记为新日志，用于动画效果
            setNewLogIds((prev) => new Set([...prev, logData.id]));
            break;
          }

          case "sync:complete":
            console.log("同步完成:", typedEvent.data);
            setIsLoading(false);

            // 刷新统计信息
            refetchStats();
            refetchContentStats();
            refreshData();
            break;
        }
      }
    },
    onError: (error) => {
      console.error("tRPC 订阅错误:", error);
      setIsLoading(false);
    },
  });

  // 检测新日志并添加进场动画
  useEffect(() => {
    if (!syncLogs || syncLogs.length === 0) {
      setNewLogIds(new Set());
      previousLogCountRef.current = 0;
      return;
    }

    // 如果日志数量增加了，标记新日志
    if (syncLogs.length > previousLogCountRef.current) {
      const newLogs = syncLogs.slice(0, syncLogs.length - previousLogCountRef.current);
      const newIds = new Set(newLogs.map((log) => log.id));
      setNewLogIds(newIds);

      // 3秒后移除新日志标记，停止动画
      setTimeout(() => {
        setNewLogIds(new Set());
      }, 3000);
    }

    previousLogCountRef.current = syncLogs.length;
  }, [syncLogs]);

  // 自动滚动到日志底部
  useEffect(() => {
    if (autoScroll && syncLogs.length > 0) {
      // 平滑滚动到底部
      const scrollToBottom = (container: HTMLDivElement) => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      };

      // 滚动桌面端日志容器
      if (logContainerRef.current) {
        scrollToBottom(logContainerRef.current);
      }
      // 滚动移动端日志容器
      if (mobileLogContainerRef.current) {
        scrollToBottom(mobileLogContainerRef.current);
      }
    }
  }, [syncLogs, autoScroll]);

  // 处理用户手动滚动
  const handleLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
    setAutoScroll(isAtBottom);
  };

  // 更新本地状态
  useEffect(() => {
    if (sourcesData) setSourcesStatus(sourcesData as SourceStatus[]);
  }, [sourcesData]);

  useEffect(() => {
    if (progressData) setSyncProgress(progressData);
  }, [progressData]);

  // 轮询同步进度
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (syncProgress?.status === "running") {
      interval = setInterval(async () => {
        try {
          await refetchProgress();
        } catch (error) {
          console.error("获取同步进度失败:", error);
          setIsLoading(false);
        }
      }, 1000);
    } else {
      // 同步不在运行时，确保重置加载状态
      setIsLoading(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncProgress?.status, refetchProgress]);

  // 触发同步的通用函数
  const handleSync = async (isFullSync: boolean) => {
    setIsLoading(true);
    setShowLogs(true); // 自动展开日志
    setSyncLogs([]); // 清空旧日志，准备显示新的同步过程
    setAutoScroll(true); // 启用自动滚动

    // 触发同步（日志通过 tRPC subscription 实时推送）
    triggerSyncMutation.mutate({
      maxConcurrentSyncs: 2,
      syncTimeout: 300000,
      enableTransactions: true,
      conflictResolution: "priority",
      isFullSync, // 传入同步类型
    });
  };

  // 触发全量同步
  const handleTriggerSync = () => handleSync(true);

  // 触发增量同步
  const handleIncrementalSync = () => handleSync(false);

  // 取消同步
  const handleCancelSync = () => {
    cancelSyncMutation.mutate();
  };

  // 触发向量化
  const handleVectorize = (isFull: boolean) => {
    setShowLogs(true);
    setAutoScroll(true);
    setSyncLogs([]);
    triggerVectorize.mutate({ isFull });
  };

  return (
    <>
      {/* 添加自定义CSS动画 */}
      <style dangerouslySetInnerHTML={{ __html: logAnimationStyles }} />

      <div className="bg-base-200 px-4 pb-4">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* 顶部状态栏 - 紧凑设计 */}
          {(systemConfig || managerStats) && (
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-4 border border-primary/20">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {/* WebDAV 状态 */}
                {systemConfig && (
                  <div className="flex items-center gap-2">
                    <Icon name="lucide:server" className="w-4 h-4" />
                    <span className="font-medium">WebDAV:</span>
                    <span
                      className={`badge badge-sm ${systemConfig.webdavEnabled ? "badge-success" : "badge-error"}`}
                    >
                      {systemConfig.webdavEnabled ? "已启用" : "未启用"}
                    </span>
                  </div>
                )}

                {/* 内容源数量 */}
                {managerStats && (
                  <>
                    <div className="flex items-center gap-2">
                      <Icon name="lucide:folder" className="w-4 h-4" />
                      <span className="font-medium">内容源:</span>
                      <span className="badge badge-sm badge-primary">
                        {managerStats.enabledSources}/{managerStats.registeredSources}
                      </span>
                    </div>

                    {/* 同步状态 */}
                    <div className="flex items-center gap-2">
                      <Icon name="lucide:activity" className="w-4 h-4" />
                      <span className="font-medium">状态:</span>
                      <span
                        className={`badge badge-sm ${
                          managerStats.currentSyncStatus === "success"
                            ? "badge-success"
                            : managerStats.currentSyncStatus === "error"
                              ? "badge-error"
                              : managerStats.currentSyncStatus === "running"
                                ? "badge-warning"
                                : "badge-ghost"
                        }`}
                      >
                        {managerStats.currentSyncStatus === "success"
                          ? "成功"
                          : managerStats.currentSyncStatus === "error"
                            ? "错误"
                            : managerStats.currentSyncStatus === "running"
                              ? "运行中"
                              : "空闲"}
                      </span>
                    </div>

                    {/* 同步次数 */}
                    <div className="flex items-center gap-2">
                      <Icon name="lucide:repeat" className="w-4 h-4" />
                      <span className="font-medium">同步次数:</span>
                      <span className="badge badge-sm badge-accent">{managerStats.totalSyncs}</span>
                    </div>

                    {/* 最后同步时间 */}
                    {managerStats.lastSyncTime && (
                      <div className="flex items-center gap-2" suppressHydrationWarning>
                        <Icon name="lucide:clock" className="w-4 h-4" />
                        <span className="font-medium">最后同步:</span>
                        <span className="badge badge-sm badge-info">
                          {typeof window === "undefined"
                            ? ""
                            : `${Math.floor((Date.now() - managerStats.lastSyncTime) / 60000)} 分钟前`}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* 内容统计面板 */}
          {contentStats && (
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body">
                <h2 className="card-title flex items-center text-accent">
                  <Icon name="lucide:bar-chart-3" className="w-5 h-5 mr-2" />
                  内容统计
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* 总计 */}
                  <div className="stat bg-primary/10 rounded-lg">
                    <div className="stat-figure text-primary">
                      <Icon name="lucide:file-text" className="w-8 h-8" />
                    </div>
                    <div className="stat-title">总内容数</div>
                    <div className="stat-value text-primary">{contentStats.total}</div>
                  </div>

                  {/* 按类型统计 */}
                  {Object.entries(contentStats.byType).map(([type, stats]) => (
                    <div key={type} className="stat bg-base-200 rounded-lg">
                      <div className="stat-figure text-secondary">
                        <Icon
                          name={type === "memo" ? "lucide:sticky-note" : "lucide:file-text"}
                          className="w-6 h-6"
                        />
                      </div>
                      <div className="stat-title">
                        {type === "memo" ? "闪念" : type === "post" ? "文章" : type}
                      </div>
                      <div className="stat-value text-secondary">{stats.total}</div>
                      <div className="stat-desc">
                        {Object.entries(stats.sources).map(([source, count]) => (
                          <span key={source} className="badge badge-xs mr-1">
                            {source}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-base-content/60 mt-2">
                  最后更新: {new Date(contentStats.lastUpdated).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* 主操作区域 - 突出设计 */}
          <div className="card bg-base-100 shadow-xl border-2 border-primary/20">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h2 className="card-title flex items-center text-primary">
                  <Icon name="lucide:play-circle" className="w-6 h-6 mr-2" />
                  同步控制
                </h2>

                {/* 内联同步状态 */}
                {syncProgress && (
                  <div className="flex items-center gap-2">
                    {syncProgress.status === "running" && (
                      <span className="loading loading-spinner loading-sm"></span>
                    )}
                    <span
                      className={`badge ${
                        syncProgress.status === "success"
                          ? "badge-success"
                          : syncProgress.status === "error"
                            ? "badge-error"
                            : syncProgress.status === "running"
                              ? "badge-warning"
                              : "badge-ghost"
                      }`}
                    >
                      {syncProgress.status === "running"
                        ? "同步中"
                        : syncProgress.status === "success"
                          ? "已完成"
                          : syncProgress.status === "error"
                            ? "失败"
                            : syncProgress.status}
                    </span>
                  </div>
                )}
              </div>

              {/* 同步进度和消息 - 紧凑显示 */}
              {syncProgress && (
                <div data-testid="sync-progress-section">
                  {syncProgress.status === "running" && (
                    <div
                      className="mb-4 p-3 bg-warning/10 rounded-lg border border-warning/20"
                      data-testid="sync-progress-running"
                    >
                      <progress
                        className="progress progress-warning w-full mb-2"
                        value={syncProgress.progress}
                        max="100"
                        data-testid="sync-progress-bar"
                        aria-label={`同步进度 ${syncProgress.progress}%`}
                      />
                      <div
                        className="text-sm text-base-content/70"
                        data-testid="sync-progress-details"
                      >
                        {syncProgress.currentStep} ({syncProgress.processedItems}/
                        {syncProgress.totalItems})
                      </div>
                    </div>
                  )}

                  {syncProgress.status === "success" && (
                    <div
                      className="mb-4 p-3 bg-success/10 rounded-lg border border-success/20 flex items-center gap-2"
                      data-testid="sync-success-message"
                    >
                      <Icon name="lucide:check-circle" className="w-5 h-5 text-success" />
                      <span className="text-success font-medium">
                        同步完成！所有数据已成功更新。
                      </span>
                    </div>
                  )}

                  {syncProgress.error && (
                    <div
                      className="mb-4 p-3 bg-error/10 rounded-lg border border-error/20 flex items-center gap-2"
                      data-testid="sync-error-message"
                    >
                      <Icon name="lucide:x-circle" className="w-5 h-5 text-error" />
                      <span className="text-error font-medium">{syncProgress.error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 控制按钮 - 紧凑设计 */}
              <div
                className="bg-base-200/50 rounded-xl p-3 border border-base-300"
                data-testid="sync-controls"
              >
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    className={`btn btn-primary ${isLoading ? "loading" : ""} shadow-md hover:shadow-lg transition-all duration-200 min-w-28 whitespace-nowrap`}
                    onClick={handleTriggerSync}
                    disabled={isLoading || syncProgress?.status === "running"}
                    data-testid="full-sync-button"
                    aria-label="触发全量同步"
                  >
                    {isLoading ? (
                      <>
                        <span className="loading loading-spinner loading-xs"></span>
                        同步中...
                      </>
                    ) : (
                      <>
                        <Icon name="lucide:database" className="w-4 h-4 mr-1" />
                        全量同步
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className={`btn btn-secondary ${isLoading ? "loading" : ""} shadow-md hover:shadow-lg transition-all duration-200 min-w-28 whitespace-nowrap`}
                    onClick={handleIncrementalSync}
                    disabled={isLoading || syncProgress?.status === "running"}
                    data-testid="incremental-sync-button"
                    aria-label="触发增量同步"
                  >
                    {isLoading ? (
                      <>
                        <span className="loading loading-spinner loading-xs"></span>
                        同步中...
                      </>
                    ) : (
                      <>
                        <Icon name="lucide:refresh-cw" className="w-4 h-4 mr-1" />
                        增量同步
                      </>
                    )}
                  </button>

                  {syncProgress?.status === "running" && (
                    <button
                      type="button"
                      className="btn btn-warning shadow-md hover:shadow-lg transition-all duration-200 min-w-28 whitespace-nowrap"
                      onClick={handleCancelSync}
                      disabled={cancelSyncMutation.isPending}
                      data-testid="cancel-sync-button"
                      aria-label="取消正在进行的同步"
                    >
                      {cancelSyncMutation.isPending ? (
                        <>
                          <span className="loading loading-spinner loading-xs"></span>
                          取消中...
                        </>
                      ) : (
                        <>
                          <Icon name="lucide:square" className="w-4 h-4 mr-1" />
                          取消同步
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-outline shadow-md hover:shadow-lg transition-all duration-200 min-w-28 whitespace-nowrap"
                    onClick={refreshData}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                      <>
                        <Icon name="lucide:rotate-ccw" className="w-4 h-4 mr-1" />
                        刷新状态
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 向量化控制与统计 */}
              <div className="mt-4 bg-base-200/50 rounded-xl p-3 border border-base-300">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold flex items-center">
                    <Icon name="lucide:sparkles" className="w-5 h-5 mr-2" />
                    AI 向量化
                  </h3>
                  {vectorStats && (
                    <div className="text-sm text-base-content/70">
                      模型: {vectorStats.model} · 维度: {vectorStats.dim} · 已索引:{" "}
                      {vectorStats.indexed}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    className={`btn btn-primary ${triggerVectorize.isPending ? "loading" : ""}`}
                    onClick={() => handleVectorize(true)}
                    disabled={triggerVectorize.isPending}
                  >
                    全量向量化
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${triggerVectorize.isPending ? "loading" : ""}`}
                    onClick={() => handleVectorize(false)}
                    disabled={triggerVectorize.isPending}
                  >
                    增量向量化
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => refetchVectorStats()}
                    disabled={triggerVectorize.isPending}
                  >
                    刷新向量化统计
                  </button>
                </div>
              </div>

              {/* 同步日志 - 紧跟在按钮下方 */}
              <div className="mt-6" data-testid="sync-logs-section">
                <div className="flex justify-between items-center">
                  <h3
                    className="text-lg font-semibold flex items-center"
                    data-testid="sync-logs-title"
                  >
                    <Icon name="lucide:clipboard-list" className="w-5 h-5 mr-2" />
                    同步日志
                    {syncLogs.length > 0 && (
                      <div className="badge badge-neutral ml-2" data-testid="sync-logs-count">
                        {syncLogs.length} 条记录
                      </div>
                    )}
                    {/* 自动滚动指示器 */}
                    {syncLogs.length > 0 && (
                      <div className="flex items-center ml-2">
                        <Icon
                          name={autoScroll ? "lucide:arrow-down" : "lucide:pause"}
                          className={`w-3 h-3 ${autoScroll ? "text-success" : "text-warning"}`}
                        />
                        <span
                          className={`text-xs ml-1 ${autoScroll ? "text-success" : "text-warning"}`}
                        >
                          {autoScroll ? "自动滚动" : "手动模式"}
                        </span>
                      </div>
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* 回到底部按钮 */}
                    {!autoScroll && syncLogs.length > 0 && showLogs && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAutoScroll(true)}
                        title="回到底部并启用自动滚动"
                      >
                        <Icon name="lucide:arrow-down-to-line" className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      className={`btn btn-outline shadow-lg transition-all duration-300 ${
                        showLogs ? "btn-warning" : "btn-success"
                      }`}
                      onClick={() => setShowLogs(!showLogs)}
                      data-testid="toggle-logs-button"
                      aria-label={showLogs ? "隐藏同步日志" : "显示同步日志"}
                    >
                      {showLogs ? (
                        <>
                          <Icon name="lucide:eye-off" className="w-4 h-4 mr-1" />
                          隐藏日志
                        </>
                      ) : (
                        <>
                          <Icon name="lucide:eye" className="w-4 h-4 mr-1" />
                          显示日志
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {showLogs && (
                  <div className="mt-4" data-testid="sync-logs-content">
                    {syncLogs.length === 0 ? (
                      <div
                        className="hero bg-base-200 rounded-xl py-16"
                        data-testid="empty-logs-state"
                      >
                        <div className="hero-content text-center">
                          <div className="max-w-md">
                            <Icon
                              name="lucide:file-text"
                              className="w-16 h-16 mx-auto mb-4 text-base-content/30"
                            />
                            <h3 className="text-2xl font-bold text-base-content/70">
                              暂无同步日志
                            </h3>
                            <p className="py-4 text-base-content/50">
                              开始同步后将显示详细的操作日志，包括每个文件的处理状态
                            </p>
                            <div className="badge badge-outline">等待同步操作</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* 桌面端表格布局 */}
                        <div
                          ref={logContainerRef}
                          className="hidden md:block overflow-x-auto max-h-96 overflow-y-auto"
                          onScroll={handleLogScroll}
                        >
                          <table className="table table-sm table-zebra table-fixed">
                            <thead className="sticky top-0 bg-base-200 z-10">
                              <tr>
                                <th className="w-24">时间</th>
                                <th className="w-28">来源</th>
                                <th className="w-24">操作</th>
                                <th className="w-28">状态</th>
                                <th className="min-w-0 flex-1">消息</th>
                              </tr>
                            </thead>
                            <tbody>
                              {syncLogs
                                .slice()
                                .reverse()
                                .map((log, index) => (
                                  <tr
                                    key={`${log.id}-${log.createdAt}-${index}`}
                                    className={`hover:bg-base-200 transition-colors duration-200 ${
                                      newLogIds.has(log.id) ? "log-entry-animation" : ""
                                    }`}
                                  >
                                    <td className="font-mono text-xs w-24">
                                      <div className="flex flex-col">
                                        <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                                        <span className="text-xs text-base-content/50">
                                          {new Date(log.createdAt).toLocaleDateString()}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="w-28">
                                      <span
                                        className={`badge badge-sm ${
                                          log.sourceName === "local"
                                            ? "badge-primary"
                                            : "badge-secondary"
                                        }`}
                                      >
                                        {log.sourceName === "local" ? (
                                          <>
                                            <Icon name="lucide:home" className="w-3 h-3 mr-1" />
                                            本地
                                          </>
                                        ) : (
                                          <>
                                            <Icon name="lucide:cloud" className="w-3 h-3 mr-1" />
                                            WebDAV
                                          </>
                                        )}
                                      </span>
                                    </td>
                                    <td className="w-24">
                                      <span className="badge badge-outline badge-sm">
                                        {log.operation}
                                      </span>
                                    </td>
                                    <td className="w-28">
                                      <span
                                        className={`badge badge-sm ${
                                          log.status === "success"
                                            ? "badge-success"
                                            : log.status === "error"
                                              ? "badge-error"
                                              : "badge-warning"
                                        }`}
                                      >
                                        {log.status === "success" ? (
                                          <>
                                            <Icon name="lucide:check" className="w-3 h-3 mr-1" />
                                            成功
                                          </>
                                        ) : log.status === "error" ? (
                                          <>
                                            <Icon name="lucide:x" className="w-3 h-3 mr-1" />
                                            失败
                                          </>
                                        ) : (
                                          <>
                                            <Icon
                                              name="lucide:alert-triangle"
                                              className="w-3 h-3 mr-1"
                                            />
                                            警告
                                          </>
                                        )}
                                      </span>
                                    </td>
                                    <td className="min-w-0 flex-1">
                                      <div className="space-y-1">
                                        {/* 第一行：日志消息 */}
                                        <div className="text-sm leading-relaxed break-words">
                                          {log.message}
                                        </div>
                                        {/* 第二行：文件路径（如果存在） */}
                                        {log.filePath && (
                                          <div className="flex items-center text-xs text-base-content/60 mt-1">
                                            <Icon
                                              name="lucide:file"
                                              className="w-3 h-3 mr-1 flex-shrink-0"
                                            />
                                            <span className="font-mono text-xs break-all">
                                              {log.filePath}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>

                        {/* 移动端卡片布局 */}
                        <div
                          ref={mobileLogContainerRef}
                          className="block md:hidden max-h-96 overflow-y-auto space-y-3"
                          onScroll={handleLogScroll}
                        >
                          {syncLogs
                            .slice()
                            .reverse()
                            .map((log, index) => (
                              <div
                                key={`${log.id}-${log.createdAt}-${index}`}
                                className={`card bg-base-100 shadow-sm border border-base-300 hover:shadow-md transition-shadow duration-200 ${
                                  newLogIds.has(log.id) ? "log-entry-animation" : ""
                                }`}
                              >
                                <div className="card-body p-4">
                                  {/* 卡片头部：时间和状态 */}
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="font-mono text-sm">
                                      <div className="font-medium">
                                        {new Date(log.createdAt).toLocaleTimeString()}
                                      </div>
                                      <div className="text-xs text-base-content/50">
                                        {new Date(log.createdAt).toLocaleDateString()}
                                      </div>
                                    </div>
                                    <span
                                      className={`badge ${
                                        log.status === "success"
                                          ? "badge-success"
                                          : log.status === "error"
                                            ? "badge-error"
                                            : "badge-warning"
                                      }`}
                                    >
                                      {log.status === "success" ? (
                                        <>
                                          <Icon name="lucide:check" className="w-3 h-3 mr-1" />
                                          成功
                                        </>
                                      ) : log.status === "error" ? (
                                        <>
                                          <Icon name="lucide:x" className="w-3 h-3 mr-1" />
                                          失败
                                        </>
                                      ) : (
                                        <>
                                          <Icon
                                            name="lucide:alert-triangle"
                                            className="w-3 h-3 mr-1"
                                          />
                                          警告
                                        </>
                                      )}
                                    </span>
                                  </div>

                                  {/* 卡片主体：来源、操作、消息 */}
                                  <div className="space-y-3">
                                    <div className="flex gap-3 flex-wrap items-center">
                                      <span
                                        className={`badge ${
                                          log.sourceName === "local"
                                            ? "badge-primary"
                                            : "badge-secondary"
                                        }`}
                                      >
                                        {log.sourceName === "local" ? (
                                          <>
                                            <Icon name="lucide:home" className="w-3 h-3 mr-1" />
                                            本地
                                          </>
                                        ) : (
                                          <>
                                            <Icon name="lucide:cloud" className="w-3 h-3 mr-1" />
                                            WebDAV
                                          </>
                                        )}
                                      </span>
                                      <span className="badge badge-outline">{log.operation}</span>
                                    </div>
                                    <div className="text-sm text-base-content leading-relaxed">
                                      {log.message}
                                    </div>
                                  </div>

                                  {/* 卡片底部：文件信息 */}
                                  {log.filePath && (
                                    <div className="mt-3 pt-2 border-t border-base-300">
                                      <div className="flex items-center gap-2">
                                        <Icon
                                          name="lucide:file"
                                          className="w-4 h-4 text-base-content/60"
                                        />
                                        <span className="text-sm font-mono text-base-content/80 break-all">
                                          {log.filePath}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 内容源状态 - 紧凑设计 */}
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body py-4">
              <h2 className="card-title flex items-center text-lg mb-3">
                <Icon name="lucide:radio" className="w-5 h-5 mr-2" />
                内容源状态
              </h2>
              <div className="overflow-x-auto">
                <table className="table table-sm table-zebra">
                  <thead>
                    <tr className="text-xs">
                      <th className="w-32">名称</th>
                      <th className="w-20">类型</th>
                      <th className="w-20">状态</th>
                      <th className="w-24">文件数</th>
                      <th className="w-28">最后同步</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourcesStatus.map((source) => (
                      <tr
                        key={source.name}
                        className="hover:bg-base-200 transition-colors duration-200"
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar placeholder">
                              <div className="bg-primary text-primary-content rounded-full w-6 h-6 !flex items-center justify-center">
                                <Icon
                                  name={source.type === "local" ? "lucide:folder" : "lucide:cloud"}
                                  className="w-3 h-3 align-baseline"
                                />
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-sm">{source.name}</div>
                              {!source.enabled && (
                                <span className="badge badge-ghost badge-xs">已禁用</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge badge-sm ${source.type === "local" ? "badge-primary" : "badge-secondary"}`}
                          >
                            {source.type === "local" ? "本地" : "WebDAV"}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <span
                              className={`badge badge-sm ${source.online ? "badge-success" : "badge-error"}`}
                            >
                              {source.online ? "在线" : "离线"}
                            </span>
                            {source.error && (
                              <div className="tooltip tooltip-error" data-tip={source.error}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs p-0"
                                  aria-label={`错误详情：${source.error}`}
                                  title={source.error}
                                >
                                  <Icon
                                    name="lucide:alert-triangle"
                                    className="w-3 h-3 text-error"
                                  />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-accent">{source.totalItems}</span>
                            <span className="text-xs text-base-content/60">个文件</span>
                          </div>
                        </td>
                        <td>
                          <div className="text-xs" suppressHydrationWarning>
                            {source.lastSync
                              ? typeof window === "undefined"
                                ? ""
                                : `${Math.floor((Date.now() - source.lastSync) / 60000)} 分钟前`
                              : "从未同步"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
