"use client";

/**
 * 内容同步管理组件
 *
 * 提供内容源状态显示、手动同步控制和日志查看功能
 */

import { useEffect, useState } from "react";
import { trpc } from "../../lib/trpc";

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
  filePath?: string;
  createdAt: number;
}

export function ContentSyncManager() {
  const [isLoading, setIsLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [sourcesStatus, setSourcesStatus] = useState<SourceStatus[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // API 查询
  const { data: systemConfig } = trpc.admin.contentSync.getSystemConfig.useQuery();
  const { data: managerStats, refetch: refetchStats } =
    trpc.admin.contentSync.getManagerStats.useQuery();

  // API 变更
  const triggerSyncMutation = trpc.admin.contentSync.triggerSync.useMutation({
    onSuccess: (result) => {
      console.log(`同步完成！处理了 ${result.stats.totalProcessed} 个项目`);
      refetchStats();
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

  // 使用 tRPC 查询
  const { data: sourcesData, refetch: refetchSources } =
    trpc.admin.contentSync.getSourcesStatus.useQuery();
  const { data: logsData, refetch: refetchLogs } = trpc.admin.contentSync.getSyncLogs.useQuery({
    limit: 50,
  });
  const { data: progressData, refetch: refetchProgress } =
    trpc.admin.contentSync.getSyncProgress.useQuery();

  // 刷新数据
  const refreshData = async () => {
    try {
      await Promise.all([refetchSources(), refetchLogs(), refetchProgress()]);
    } catch (error) {
      console.error("刷新数据失败:", error);
    }
  };

  // 更新本地状态
  useEffect(() => {
    if (sourcesData) setSourcesStatus(sourcesData);
  }, [sourcesData]);

  useEffect(() => {
    if (logsData) setSyncLogs(logsData);
  }, [logsData]);

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

          if (progressData?.status !== "running") {
            setIsLoading(false);
            refreshData();
          }
        } catch (error) {
          console.error("获取同步进度失败:", error);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncProgress?.status, progressData?.status, refetchProgress, refreshData]);

  // 触发同步
  const handleTriggerSync = async () => {
    setIsLoading(true);
    triggerSyncMutation.mutate({
      maxConcurrentSyncs: 2,
      syncTimeout: 300000,
      enableTransactions: true,
      conflictResolution: "priority",
    });
  };

  // 取消同步
  const handleCancelSync = () => {
    cancelSyncMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* 系统配置信息 */}
      {systemConfig && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">系统配置</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-semibold">WebDAV 状态:</span>
                <span
                  className={`ml-2 badge ${systemConfig.webdavEnabled ? "badge-success" : "badge-error"}`}
                >
                  {systemConfig.webdavEnabled ? "已启用" : "未启用"}
                </span>
              </div>
              {systemConfig.webdavUrl && (
                <div>
                  <span className="font-semibold">WebDAV URL:</span>
                  <span className="ml-2 text-sm font-mono">{systemConfig.webdavUrl}</span>
                </div>
              )}
              <div>
                <span className="font-semibold">支持的内容源:</span>
                <span className="ml-2">{systemConfig.supportedSources.join(", ")}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 管理器统计信息 */}
      {managerStats && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">管理器状态</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="stat">
                <div className="stat-title">注册的内容源</div>
                <div className="stat-value text-primary">{managerStats.registeredSources}</div>
              </div>
              <div className="stat">
                <div className="stat-title">启用的内容源</div>
                <div className="stat-value text-secondary">{managerStats.enabledSources}</div>
              </div>
              <div className="stat">
                <div className="stat-title">当前状态</div>
                <div
                  className={`stat-value text-sm ${
                    managerStats.currentSyncStatus === "success"
                      ? "text-success"
                      : managerStats.currentSyncStatus === "error"
                        ? "text-error"
                        : managerStats.currentSyncStatus === "running"
                          ? "text-warning"
                          : "text-base-content"
                  }`}
                >
                  {managerStats.currentSyncStatus || "空闲"}
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">总同步次数</div>
                <div className="stat-value text-accent">{managerStats.totalSyncs}</div>
              </div>
            </div>
            {managerStats.lastSyncTime && (
              <div className="mt-4">
                <span className="font-semibold">最后同步时间:</span>
                <span className="ml-2 text-sm">
                  {new Date(managerStats.lastSyncTime).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 同步控制 */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">同步控制</h2>

          {/* 同步进度 */}
          {syncProgress && syncProgress.status === "running" && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold">同步进度</span>
                <span className="text-sm">{syncProgress.progress}%</span>
              </div>
              <progress
                className="progress progress-primary w-full"
                value={syncProgress.progress}
                max="100"
              />
              <div className="text-sm text-gray-600 mt-1">
                {syncProgress.currentStep} ({syncProgress.processedItems}/{syncProgress.totalItems})
              </div>
              {syncProgress.error && (
                <div className="alert alert-error mt-2">
                  <span>{syncProgress.error}</span>
                </div>
              )}
            </div>
          )}

          {/* 控制按钮 */}
          <div className="flex gap-4">
            <button
              className={`btn btn-primary ${isLoading ? "loading" : ""}`}
              onClick={handleTriggerSync}
              disabled={isLoading || syncProgress?.status === "running"}
            >
              {isLoading ? "同步中..." : "触发全量同步"}
            </button>

            {syncProgress?.status === "running" && (
              <button
                className="btn btn-warning"
                onClick={handleCancelSync}
                disabled={cancelSyncMutation.isLoading}
              >
                取消同步
              </button>
            )}

            <button className="btn btn-ghost" onClick={refreshData} disabled={isLoading}>
              刷新状态
            </button>
          </div>
        </div>
      </div>

      {/* 内容源状态 */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">内容源状态</h2>
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>文件数</th>
                  <th>最后同步</th>
                </tr>
              </thead>
              <tbody>
                {sourcesStatus.map((source) => (
                  <tr key={source.name}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{source.name}</span>
                        {!source.enabled && (
                          <span className="badge badge-ghost badge-sm">已禁用</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-outline">{source.type}</span>
                    </td>
                    <td>{source.priority}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge ${source.online ? "badge-success" : "badge-error"}`}
                        >
                          {source.online ? "在线" : "离线"}
                        </span>
                        {source.error && (
                          <div className="tooltip" data-tip={source.error}>
                            <span className="badge badge-error badge-sm">!</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>{source.totalItems}</td>
                    <td className="text-sm">
                      {source.lastSync ? new Date(source.lastSync).toLocaleString() : "从未同步"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 同步日志 */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex justify-between items-center">
            <h2 className="card-title">同步日志</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(!showLogs)}>
              {showLogs ? "隐藏日志" : "显示日志"}
            </button>
          </div>

          {showLogs && (
            <div className="mt-4">
              {syncLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-8">暂无同步日志</div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="table table-xs">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>来源</th>
                        <th>操作</th>
                        <th>状态</th>
                        <th>消息</th>
                        <th>文件</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncLogs
                        .slice()
                        .reverse()
                        .map((log) => (
                          <tr key={log.id}>
                            <td className="text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                            <td>
                              <span className="badge badge-outline badge-xs">{log.sourceName}</span>
                            </td>
                            <td>{log.operation}</td>
                            <td>
                              <span
                                className={`badge badge-xs ${
                                  log.status === "success"
                                    ? "badge-success"
                                    : log.status === "error"
                                      ? "badge-error"
                                      : "badge-warning"
                                }`}
                              >
                                {log.status}
                              </span>
                            </td>
                            <td className="text-xs max-w-xs truncate" title={log.message}>
                              {log.message}
                            </td>
                            <td className="text-xs">
                              {log.filePath && (
                                <span className="font-mono text-xs" title={log.filePath}>
                                  {log.filePath.split("/").pop()}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
