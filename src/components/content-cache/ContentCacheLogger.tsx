import { useMemo, useState } from 'react';
import type { ContentCacheProgress } from '~/lib/content-cache';
import { trpc } from '~/lib/trpc';

export function ContentCacheLogger() {
  const [logs, setLogs] = useState<ContentCacheProgress[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isForceRefresh, setIsForceRefresh] = useState(false);

  const mutation = trpc.contentCache.refresh.useMutation();

  trpc.contentCache.onProgress.useSubscription(undefined, {
    onData: (log) => {
      setLogs((prev) => [log, ...prev]);
      if (log.stage === 'error') {
        setError(log.message);
        setStatus('error');
      }
      if (log.stage === 'done') {
        setStatus('completed');
      }
    },
    onError: (err) => {
      setError(err.message);
      setStatus('error');
    },
  });

  const handleRefresh = (force: boolean) => {
    setLogs([]);
    setError(null);
    setStatus('running');
    setIsForceRefresh(force);
    mutation.mutate({ force });
  };

  // 计算整体进度
  const overallPercentage = useMemo(() => {
    if (logs.length === 0) return 0;
    const latestLog = logs[0];
    return latestLog.percentage || 0;
  }, [logs]);

  // 获取进度消息
  const progressMessage = useMemo(() => {
    if (logs.length === 0) {
      switch (status) {
        case 'idle':
          return '等待开始...';
        case 'running':
          return '正在启动...';
        case 'completed':
          return '刷新完成';
        case 'error':
          return '刷新失败';
        default:
          return '等待开始...';
      }
    }
    return logs[0].message;
  }, [logs, status]);

  // 获取阶段徽章样式
  const getStageBadgeClass = (stage: string) => {
    switch (stage) {
      case 'start':
        return 'badge-info';
      case 'posts':
      case 'memos':
        return 'badge-primary';
      case 'done':
        return 'badge-success';
      case 'error':
        return 'badge-error';
      default:
        return 'badge-neutral';
    }
  };

  const getButtonState = (force: boolean) => {
    switch (status) {
      case 'running':
        return {
          disabled: true,
          text: '正在处理...',
          icon: <span className="loading loading-spinner"></span>,
        };
      case 'completed':
        return {
          disabled: false,
          text: force ? '重新强制刷新' : '重新智能刷新',
          icon: null,
        };
      case 'error':
        return {
          disabled: false,
          text: '重试',
          icon: null,
        };
      default:
        return {
          disabled: false,
          text: force ? '强制刷新' : '智能刷新',
          icon: null,
        };
    }
  };

  const smartButtonState = getButtonState(false);
  const forceButtonState = getButtonState(true);

  return (
    <div className="space-y-6">
      {/* 状态概览 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-base-100 border border-base-300 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
              <div
                className={`w-3 h-3 rounded-full ${
                  status === 'completed'
                    ? 'bg-success'
                    : status === 'error'
                      ? 'bg-error'
                      : status === 'running'
                        ? 'bg-warning'
                        : 'bg-base-300'
                }`}
              ></div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm">状态</h3>
              <p className="text-xs text-base-content/70 font-medium">
                {status === 'idle'
                  ? '空闲'
                  : status === 'running'
                    ? '运行中'
                    : status === 'completed'
                      ? '已完成'
                      : '错误'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-base-100 border border-base-300 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-primary"></div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm">进度</h3>
              <p className="text-xs text-base-content/70 font-medium">{overallPercentage.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-base-100 border border-base-300 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-secondary"></div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm">模式</h3>
              <p className="text-xs text-base-content/70 font-medium">
                {status === 'running' ? (isForceRefresh ? '强制' : '智能') : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-base-100 border border-base-300 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-info"></div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm">日志条目</h3>
              <p className="text-xs text-base-content/70 font-medium">{logs.length} 条</p>
            </div>
          </div>
        </div>
      </div>

      {/* 主控制面板 */}
      <div className="bg-base-100 border border-base-300 rounded-lg">
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">内容缓存刷新控制台</h2>
            <div className="flex gap-2">
              <button
                className={`btn ${status === 'completed' ? 'btn-success' : status === 'error' ? 'btn-warning' : 'btn-primary'} btn-sm`}
                onClick={() => handleRefresh(false)}
                disabled={smartButtonState.disabled}
              >
                {smartButtonState.icon}
                {smartButtonState.text}
              </button>
              <button
                className={`btn ${status === 'completed' ? 'btn-success' : status === 'error' ? 'btn-warning' : 'btn-warning'} btn-sm`}
                onClick={() => handleRefresh(true)}
                disabled={forceButtonState.disabled}
              >
                {forceButtonState.icon}
                {forceButtonState.text}
              </button>
            </div>
          </div>

          {/* 进度显示区域 */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-base-content/80">{progressMessage}</p>
              <span className="text-sm text-base-content/60 font-mono">{overallPercentage.toFixed(1)}%</span>
            </div>
            <progress
              className={`progress w-full h-2 ${status === 'completed' ? 'progress-success' : status === 'error' ? 'progress-error' : 'progress-primary'}`}
              value={overallPercentage}
              max="100"
            ></progress>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="alert alert-error mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* 日志显示区域 */}
          <div className="bg-base-200/50 border border-base-300 rounded-lg h-80 overflow-hidden">
            {logs.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full text-base-content/50">
                <div className="w-12 h-12 rounded-full bg-base-300/50 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <p className="text-center text-sm">
                  {status === 'idle' ? '点击刷新按钮启动缓存刷新过程' : '等待日志输出...'}
                </p>
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-3 space-y-2">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-2 p-2 rounded bg-base-100/80 border border-base-300/50"
                  >
                    <span
                      className={`badge ${getStageBadgeClass(log.stage)} badge-sm flex-shrink-0 min-w-[70px] justify-center`}
                    >
                      {log.stage}
                    </span>
                    <span className="flex-1 text-xs font-mono text-base-content/80 leading-relaxed">{log.message}</span>
                    {log.percentage !== undefined && (
                      <span className="text-xs text-base-content/60 flex-shrink-0 font-mono font-medium">
                        {log.percentage.toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
