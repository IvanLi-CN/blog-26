import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useEffect, useState } from 'react';
import type { AppRouter } from '~/server/router';

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});

interface TrendData {
  posts: { date: string; count: number }[];
  memos: { date: string; count: number }[];
  comments: { date: string; count: number }[];
  reactions: { date: string; count: number }[];
}

interface TrendChartProps {
  days?: number;
}

export default function TrendChart({ days = 30 }: TrendChartProps) {
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState({
    posts: true,
    memos: true,
    comments: true,
    reactions: true,
  });

  useEffect(() => {
    loadTrendData();
  }, [days]);

  const loadTrendData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await trpc.stats.getTrendStats.query({ days });
      setTrendData(data);
    } catch (err) {
      console.error('Failed to load trend data:', err);
      setError('加载趋势数据失败');
    } finally {
      setLoading(false);
    }
  };

  const generateChartData = () => {
    if (!trendData) return [];

    // 获取所有日期
    const allDates = new Set([
      ...trendData.posts.map((p) => p.date),
      ...trendData.memos.map((m) => m.date),
      ...trendData.comments.map((c) => c.date),
      ...trendData.reactions.map((r) => r.date),
    ]);

    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map((date) => {
      const posts = trendData.posts.find((p) => p.date === date)?.count || 0;
      const memos = trendData.memos.find((m) => m.date === date)?.count || 0;
      const comments = trendData.comments.find((c) => c.date === date)?.count || 0;
      const reactions = trendData.reactions.find((r) => r.date === date)?.count || 0;

      return {
        date,
        posts,
        memos,
        comments,
        reactions,
        total: posts + memos + comments + reactions,
      };
    });
  };

  const chartData = generateChartData();
  const maxValue = Math.max(
    ...chartData.map((d) => {
      let max = 0;
      if (selectedMetrics.posts) max = Math.max(max, d.posts);
      if (selectedMetrics.memos) max = Math.max(max, d.memos);
      if (selectedMetrics.comments) max = Math.max(max, d.comments);
      if (selectedMetrics.reactions) max = Math.max(max, d.reactions);
      return max;
    })
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const toggleMetric = (metric: keyof typeof selectedMetrics) => {
    setSelectedMetrics((prev) => ({
      ...prev,
      [metric]: !prev[metric],
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
        <span className="ml-2">正在加载趋势图...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="text-error mb-2">⚠️</div>
          <div className="text-error">{error}</div>
          <button className="btn btn-sm btn-outline mt-2" onClick={loadTrendData}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center text-base-content/60">暂无趋势数据</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 图例和控制 */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          className={`btn btn-xs ${selectedMetrics.posts ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => toggleMetric('posts')}
        >
          📝 文章
        </button>
        <button
          className={`btn btn-xs ${selectedMetrics.memos ? 'btn-success' : 'btn-outline'}`}
          onClick={() => toggleMetric('memos')}
        >
          💭 闪念
        </button>
        <button
          className={`btn btn-xs ${selectedMetrics.comments ? 'btn-secondary' : 'btn-outline'}`}
          onClick={() => toggleMetric('comments')}
        >
          💬 评论
        </button>
        <button
          className={`btn btn-xs ${selectedMetrics.reactions ? 'btn-accent' : 'btn-outline'}`}
          onClick={() => toggleMetric('reactions')}
        >
          ❤️ 反应
        </button>
      </div>

      {/* 图表 */}
      <div className="relative">
        {/* Y轴标签 */}
        <div className="absolute left-0 top-0 bottom-8 w-8 flex flex-col justify-between text-xs text-base-content/60">
          <span>{maxValue}</span>
          <span>{Math.floor(maxValue * 0.75)}</span>
          <span>{Math.floor(maxValue * 0.5)}</span>
          <span>{Math.floor(maxValue * 0.25)}</span>
          <span>0</span>
        </div>

        {/* 图表区域 */}
        <div className="ml-10 mr-2">
          <div className="flex items-end justify-between gap-1 h-64 border-l border-b border-base-300 pl-2 pb-2">
            {chartData.map((data) => {
              const barWidth = Math.max(100 / chartData.length - 1, 8); // 最小宽度8px

              return (
                <div
                  key={data.date}
                  className="flex flex-col items-center group relative"
                  style={{ width: `${barWidth}%` }}
                >
                  {/* 堆叠柱状图 */}
                  <div className="flex flex-col w-full relative">
                    {selectedMetrics.reactions && data.reactions > 0 && (
                      <div
                        className="bg-accent rounded-t w-full"
                        style={{
                          height: `${(data.reactions / maxValue) * 240}px`,
                        }}
                        title={`反应: ${data.reactions}`}
                      />
                    )}
                    {selectedMetrics.comments && data.comments > 0 && (
                      <div
                        className="bg-secondary w-full"
                        style={{
                          height: `${(data.comments / maxValue) * 240}px`,
                        }}
                        title={`评论: ${data.comments}`}
                      />
                    )}
                    {selectedMetrics.memos && data.memos > 0 && (
                      <div
                        className="bg-success w-full"
                        style={{
                          height: `${(data.memos / maxValue) * 240}px`,
                        }}
                        title={`闪念: ${data.memos}`}
                      />
                    )}
                    {selectedMetrics.posts && data.posts > 0 && (
                      <div
                        className="bg-primary rounded-b w-full"
                        style={{
                          height: `${(data.posts / maxValue) * 240}px`,
                        }}
                        title={`文章: ${data.posts}`}
                      />
                    )}
                  </div>

                  {/* 日期标签 */}
                  <div className="text-xs mt-2 transform -rotate-45 origin-left whitespace-nowrap">
                    {formatDate(data.date)}
                  </div>

                  {/* 悬停提示 */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-base-100 border border-base-300 rounded-lg p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 min-w-max">
                    <div className="text-xs space-y-1">
                      <div className="font-semibold">{data.date}</div>
                      {selectedMetrics.posts && <div className="text-primary">📝 文章: {data.posts}</div>}
                      {selectedMetrics.memos && <div className="text-success">💭 闪念: {data.memos}</div>}
                      {selectedMetrics.comments && <div className="text-secondary">💬 评论: {data.comments}</div>}
                      {selectedMetrics.reactions && <div className="text-accent">❤️ 反应: {data.reactions}</div>}
                      <div className="border-t pt-1 font-semibold">总计: {data.total}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 统计摘要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="bg-primary/10 rounded-lg p-3">
          <div className="text-primary font-bold text-lg">{chartData.reduce((sum, d) => sum + d.posts, 0)}</div>
          <div className="text-xs text-primary/70">总文章数</div>
        </div>
        <div className="bg-success/10 rounded-lg p-3">
          <div className="text-success font-bold text-lg">{chartData.reduce((sum, d) => sum + d.memos, 0)}</div>
          <div className="text-xs text-success/70">总闪念数</div>
        </div>
        <div className="bg-secondary/10 rounded-lg p-3">
          <div className="text-secondary font-bold text-lg">{chartData.reduce((sum, d) => sum + d.comments, 0)}</div>
          <div className="text-xs text-secondary/70">总评论数</div>
        </div>
        <div className="bg-accent/10 rounded-lg p-3">
          <div className="text-accent font-bold text-lg">{chartData.reduce((sum, d) => sum + d.reactions, 0)}</div>
          <div className="text-xs text-accent/70">总反应数</div>
        </div>
      </div>
    </div>
  );
}
