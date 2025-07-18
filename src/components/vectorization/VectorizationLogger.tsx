import { useMemo, useState } from 'react';
import { trpc } from '~/lib/trpc';
import type { VectorizationProgress } from '~/lib/vectorizer';

export function VectorizationLogger() {
  const [logs, setLogs] = useState<VectorizationProgress[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.vectorization.startVectorization.useMutation();

  trpc.vectorization.onProgress.useSubscription(undefined, {
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

  const handleStartVectorization = () => {
    setLogs([]);
    setError(null);
    setStatus('running');
    mutation.mutate();
  };

  const { overallPercentage, progressMessage, statusInfo } = useMemo(() => {
    if (status === 'idle') {
      return {
        overallPercentage: 0,
        progressMessage: '点击开始按钮启动向量化过程',
        statusInfo: {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
          text: '待开始',
          color: 'text-base-content/60',
        },
      };
    }
    if (status === 'running') {
      const lastLog = logs[0];
      if (!lastLog)
        return {
          overallPercentage: 0,
          progressMessage: '正在初始化向量化系统...',
          statusInfo: {
            icon: (
              <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ),
            text: '初始化中',
            color: 'text-info',
          },
        };
      return {
        overallPercentage: lastLog.percentage ?? 0,
        progressMessage: lastLog.message,
        statusInfo: {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          ),
          text: '处理中',
          color: 'text-info',
        },
      };
    }
    if (status === 'completed') {
      return {
        overallPercentage: 100,
        progressMessage: '所有内容已成功向量化，可用于智能搜索',
        statusInfo: {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
          text: '已完成',
          color: 'text-success',
        },
      };
    }
    if (status === 'error') {
      return {
        overallPercentage: logs[0]?.percentage ?? 0,
        progressMessage: `处理过程中发生错误: ${error}`,
        statusInfo: {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
          text: '出错',
          color: 'text-error',
        },
      };
    }
    return {
      overallPercentage: 0,
      progressMessage: '未知状态',
      statusInfo: {
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ),
        text: '未知',
        color: 'text-base-content/60',
      },
    };
  }, [logs, status, error]);

  const getStageBadgeClass = (stage: VectorizationProgress['stage']) => {
    switch (stage) {
      case 'vectorizing':
        return 'badge-info';
      case 'deleting':
        return 'badge-warning';
      case 'done':
        return 'badge-success';
      case 'error':
        return 'badge-error';
      default:
        return 'badge-secondary';
    }
  };

  const getButtonState = () => {
    switch (status) {
      case 'running':
        return { disabled: true, text: '正在处理...', icon: <span className="loading loading-spinner"></span> };
      case 'completed':
        return { disabled: false, text: '重新开始', icon: null };
      case 'error':
        return { disabled: false, text: '重试', icon: null };
      default:
        return { disabled: false, text: '开始向量化', icon: null };
    }
  };

  const buttonState = getButtonState();

  return (
    <div className="space-y-4">
      {/* 状态概览卡片 - 更紧凑的设计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-base-100 border border-base-300 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <div className={`${statusInfo.color} flex-shrink-0`}>{statusInfo.icon}</div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm">当前状态</h3>
              <p className={`text-xs ${statusInfo.color} font-medium`}>{statusInfo.text}</p>
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
            <h2 className="text-lg font-semibold">内容向量化控制台</h2>
            <button
              className={`btn ${status === 'completed' ? 'btn-success' : status === 'error' ? 'btn-warning' : 'btn-primary'} btn-sm`}
              onClick={handleStartVectorization}
              disabled={buttonState.disabled}
            >
              {buttonState.icon}
              {buttonState.text}
            </button>
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

          {/* 错误提示 */}
          {status === 'error' && error && (
            <div role="alert" className="alert alert-error mb-6">
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
              <span>{error}</span>
            </div>
          )}

          {/* 成功提示 */}
          {status === 'completed' && (
            <div role="alert" className="alert alert-success mb-6">
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>向量化过程已成功完成！所有内容现在都可以用于智能搜索。</span>
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
                  {status === 'idle' ? '点击开始按钮启动向量化过程' : '等待日志输出...'}
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
