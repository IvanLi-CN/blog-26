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

interface ActivityData {
  date: string;
  total: number;
  posts: number;
  memos: number;
  comments: number;
  reactions: number;
}

interface ActivityCalendarProps {
  year?: number;
  month?: number;
}

export default function ActivityCalendar({ year = new Date().getFullYear(), month }: ActivityCalendarProps) {
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadActivityData();
  }, [year, month]);

  const loadActivityData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: { year: number; month?: number } = { year };
      if (month) {
        params.month = month;
      }
      const data = await trpc.stats.getActivityCalendar.query(params);
      setActivities(data);
    } catch (err) {
      console.error('Failed to load activity data:', err);
      setError('加载活动数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getActivityLevel = (total: number): number => {
    if (total === 0) return 0;
    if (total <= 2) return 1;
    if (total <= 5) return 2;
    if (total <= 10) return 3;
    return 4;
  };

  const getActivityColor = (level: number): string => {
    const colors = [
      'bg-base-300', // 无活动
      'bg-success/30', // 低活动
      'bg-success/50', // 中等活动
      'bg-success/70', // 高活动
      'bg-success', // 非常高活动
    ];
    return colors[level] || colors[0];
  };

  const generateCalendarGrid = () => {
    if (!month) {
      // 年视图 - 显示每月的活动汇总
      const monthlyData: { [key: string]: ActivityData } = {};
      activities.forEach((activity) => {
        const monthKey = activity.date.substring(0, 7); // YYYY-MM
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            date: monthKey,
            total: 0,
            posts: 0,
            memos: 0,
            comments: 0,
            reactions: 0,
          };
        }
        monthlyData[monthKey].total += activity.total;
        monthlyData[monthKey].posts += activity.posts;
        monthlyData[monthKey].memos += activity.memos;
        monthlyData[monthKey].comments += activity.comments;
        monthlyData[monthKey].reactions += activity.reactions;
      });

      const months: ActivityData[] = [];
      for (let m = 1; m <= 12; m++) {
        const monthKey = `${year}-${m.toString().padStart(2, '0')}`;
        const data: ActivityData = monthlyData[monthKey] || {
          date: monthKey,
          total: 0,
          posts: 0,
          memos: 0,
          comments: 0,
          reactions: 0,
        };
        months.push(data);
      }

      return (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
          {months.map((monthData) => {
            const monthNum = parseInt(monthData.date.split('-')[1]);
            const monthName = new Date(year, monthNum - 1).toLocaleDateString('zh-CN', { month: 'long' });
            const level = getActivityLevel(monthData.total);

            return (
              <div
                key={monthData.date}
                className={`p-4 rounded-lg border-2 border-base-300 ${getActivityColor(level)} hover:scale-105 transition-transform cursor-pointer`}
                title={`${monthName}: ${monthData.total} 个活动`}
              >
                <div className="text-center">
                  <div className="font-semibold text-lg">{monthName}</div>
                  <div className="text-2xl font-bold mt-2">{monthData.total}</div>
                  <div className="text-xs mt-2 space-y-1">
                    {monthData.posts > 0 && <div>📝 {monthData.posts} 篇文章</div>}
                    {monthData.memos > 0 && <div>💭 {monthData.memos} 条闪念</div>}
                    {monthData.comments > 0 && <div>💬 {monthData.comments} 条评论</div>}
                    {monthData.reactions > 0 && <div>❤️ {monthData.reactions} 个反应</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    } else {
      // 月视图 - 显示每天的活动
      const daysInMonth = new Date(year, month, 0).getDate();
      const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
      const activityMap: { [key: string]: ActivityData } = {};

      activities.forEach((activity) => {
        activityMap[activity.date] = activity;
      });

      const days: React.ReactElement[] = [];

      // 添加空白天数（月初）
      for (let i = 0; i < firstDayOfWeek; i++) {
        days.push(<div key={`empty-${i}`} className="h-12"></div>);
      }

      // 添加月份中的每一天
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const dayData = activityMap[dateStr];
        const level = dayData ? getActivityLevel(dayData.total) : 0;

        days.push(
          <div
            key={day}
            className={`h-12 w-12 rounded-lg border border-base-300 ${getActivityColor(level)} flex items-center justify-center hover:scale-110 transition-transform cursor-pointer relative group`}
            title={dayData ? `${dateStr}: ${dayData.total} 个活动` : `${dateStr}: 无活动`}
          >
            <span className="text-sm font-medium">{day}</span>
            {dayData && dayData.total > 0 && (
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-base-100 border border-base-300 rounded-lg p-2 shadow-lg z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none min-w-max">
                <div className="text-xs space-y-1">
                  <div className="font-semibold">{dateStr}</div>
                  {dayData.posts > 0 && <div>📝 {dayData.posts} 篇文章</div>}
                  {dayData.memos > 0 && <div>💭 {dayData.memos} 条闪念</div>}
                  {dayData.comments > 0 && <div>💬 {dayData.comments} 条评论</div>}
                  {dayData.reactions > 0 && <div>❤️ {dayData.reactions} 个反应</div>}
                </div>
              </div>
            )}
          </div>
        );
      }

      return (
        <div>
          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-base-content/60 h-8 flex items-center justify-center"
              >
                {day}
              </div>
            ))}
          </div>

          {/* 日历网格 */}
          <div className="grid grid-cols-7 gap-2">{days}</div>
        </div>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
        <span className="ml-2">正在加载活动日历...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="text-error mb-2">⚠️</div>
          <div className="text-error">{error}</div>
          <button className="btn btn-sm btn-outline mt-2" onClick={loadActivityData}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {generateCalendarGrid()}

      {/* 图例 */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-base-content/60">活动强度:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-base-300"></div>
          <span>无</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success/30"></div>
          <span>低</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success/50"></div>
          <span>中</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success/70"></div>
          <span>高</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success"></div>
          <span>很高</span>
        </div>
      </div>
    </div>
  );
}
