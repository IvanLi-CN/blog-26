import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, FileText, MessageSquareMore, Users } from "lucide-react";
import { type AdminDashboardAiUsage, adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { formatCount, formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

const usageMetricToneClasses = {
  primary: "border-primary/20 bg-primary/8 text-primary",
  secondary: "border-secondary/20 bg-secondary/8 text-secondary",
  warning: "border-warning/24 bg-warning/10 text-warning",
  success: "border-success/20 bg-success/8 text-success",
} as const;

function DashboardUsageMetric({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  tone: keyof typeof usageMetricToneClasses;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${usageMetricToneClasses[tone]}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <BarChart3 className="size-4" />
        {title}
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

function DashboardUsageTrend({ data }: { data: AdminDashboardAiUsage["trend"] }) {
  const max = Math.max(
    1,
    ...data.map(
      (item) =>
        Math.max(0, item.inputTokens - item.cachedInputTokens) +
        item.cachedInputTokens +
        item.outputTokens
    )
  );
  const bandWidth = Math.max(42, (760 - 60) / Math.max(1, data.length));
  const width = Math.max(760, 60 + data.length * bandWidth);
  const chartHeight = 220;
  const barWidth = Math.max(14, Math.min(28, bandWidth - 10));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto admin-scrollbar">
        <svg
          className="h-56"
          style={{ width: `${width}px`, minWidth: "620px" }}
          viewBox={`0 0 ${width} ${chartHeight}`}
          role="img"
          aria-labelledby="dashboard-usage-trend-title dashboard-usage-trend-description"
        >
          <title id="dashboard-usage-trend-title">最近七日 AI Token 消耗趋势</title>
          <desc id="dashboard-usage-trend-description">
            未缓存输入、缓存命中输入和输出按统计时区逐日堆叠，数值以旁边的表格为准。
          </desc>
          <line
            x1="20"
            y1="190"
            x2={width - 20}
            y2="190"
            stroke="currentColor"
            className="text-border"
          />
          {data.map((item, index) => {
            const x = 30 + index * bandWidth;
            const input = Math.max(0, item.inputTokens - item.cachedInputTokens);
            const cached = item.cachedInputTokens;
            const output = item.outputTokens;
            const inputHeight = (input / max) * 160;
            const cachedHeight = (cached / max) * 160;
            const outputHeight = (output / max) * 160;
            const base = 190;
            return (
              <g key={item.day}>
                <rect
                  x={x}
                  y={base - inputHeight}
                  width={barWidth}
                  height={inputHeight}
                  rx="4"
                  className="fill-primary/70"
                />
                <rect
                  x={x}
                  y={base - inputHeight - cachedHeight}
                  width={barWidth}
                  height={cachedHeight}
                  rx="4"
                  className="fill-secondary/75"
                />
                <rect
                  x={x}
                  y={base - inputHeight - cachedHeight - outputHeight}
                  width={barWidth}
                  height={outputHeight}
                  rx="4"
                  className="fill-warning/80"
                />
                <text
                  x={x + barWidth / 2}
                  y="210"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {item.day.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-primary/70" />
          未缓存输入
        </span>
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-secondary/75" />
          缓存命中输入
        </span>
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-warning/80" />
          输出
        </span>
      </div>
      <div className="overflow-x-auto admin-scrollbar">
        <Table aria-label="最近七日 AI 用量同值表格">
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead>未缓存输入</TableHead>
              <TableHead>缓存命中输入</TableHead>
              <TableHead>输出</TableHead>
              <TableHead>调用</TableHead>
              <TableHead>失败</TableHead>
              <TableHead>中止</TableHead>
              <TableHead>缺失 / 估算</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.day}>
                <TableCell>{item.day}</TableCell>
                <TableCell>
                  {formatCount(Math.max(0, item.inputTokens - item.cachedInputTokens))}
                </TableCell>
                <TableCell>{formatCount(item.cachedInputTokens)}</TableCell>
                <TableCell>{formatCount(item.outputTokens)}</TableCell>
                <TableCell>{formatCount(item.callCount)}</TableCell>
                <TableCell>{formatCount(item.failureCallCount)}</TableCell>
                <TableCell>{formatCount(item.cancelledCallCount)}</TableCell>
                <TableCell>
                  {formatCount(item.missingCallCount)} / {formatCount(item.estimatedCallCount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DashboardUsagePanel({ usage }: { usage: AdminDashboardAiUsage }) {
  const { metric } = usage;
  const uncachedInputTokens = Math.max(0, metric.inputTokens - metric.cachedInputTokens);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>最近七日 AI 用量</CardTitle>
            <CardDescription>
              {usage.range.from} 至 {usage.range.to} · 统计时区 {usage.timezone}
            </CardDescription>
          </div>
          <Badge tone="outline">含今天</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardUsageMetric
            title="输入 Token"
            value={formatCount(metric.inputTokens)}
            description={`未缓存 ${formatCount(uncachedInputTokens)}`}
            tone="primary"
          />
          <DashboardUsageMetric
            title="缓存命中 Token"
            value={formatCount(metric.cachedInputTokens)}
            description="按提供方包含关系计入输入，不重复堆叠。"
            tone="secondary"
          />
          <DashboardUsageMetric
            title="输出 Token"
            value={formatCount(metric.outputTokens)}
            description={`总 Token ${formatCount(metric.totalTokens)}`}
            tone="warning"
          />
          <DashboardUsageMetric
            title="调用次数"
            value={formatCount(metric.callCount)}
            description={`成功 ${formatCount(metric.successCallCount)} · 失败 ${formatCount(metric.failureCallCount)} · 中止 ${formatCount(metric.cancelledCallCount)} · 缺失 ${formatCount(metric.missingCallCount)} · 估算 ${formatCount(metric.estimatedCallCount)}`}
            tone="success"
          />
        </div>
        <DashboardUsageTrend data={usage.trend} />
      </CardContent>
    </Card>
  );
}

const statCards = [
  { key: "posts", title: "文章总数", icon: FileText, tone: "text-primary bg-primary/12" },
  {
    key: "comments",
    title: "评论总数",
    icon: MessageSquareMore,
    tone: "text-secondary bg-secondary/14",
  },
  { key: "users", title: "注册用户", icon: Users, tone: "text-success bg-success/14" },
  {
    key: "activity",
    title: "验证码请求",
    icon: Activity,
    tone: "text-warning bg-warning/16",
  },
] as const;

export function DashboardPage() {
  const statsQuery = useQuery({ queryKey: ["dashboard-stats"], queryFn: adminApi.dashboardStats });
  const activityQuery = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => adminApi.dashboardRecentActivity(12),
  });
  const usageQuery = useQuery({
    queryKey: ["dashboard-ai-usage"],
    queryFn: adminApi.dashboardAiUsage,
  });

  if (statsQuery.isLoading) {
    return (
      <EmptyState
        title="正在加载仪表盘"
        description="稍等一下，后台正在整理最新统计数据。"
        action={<Spinner className="size-6" />}
      />
    );
  }

  if (statsQuery.error) {
    return <Alert tone="danger">加载仪表盘失败：{getErrorMessage(statsQuery.error)}</Alert>;
  }

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader title="管理员仪表盘" description="查看站点概况、近期活动与后台健康状态。" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const value =
            card.key === "posts"
              ? stats.posts.total
              : card.key === "comments"
                ? stats.comments.total
                : card.key === "users"
                  ? stats.users.total
                  : stats.activity.verificationCodes;
          const description =
            card.key === "posts"
              ? `已发布 ${stats.posts.published} · 草稿 ${stats.posts.draft}`
              : card.key === "comments"
                ? `已批准 ${stats.comments.approved} · 待审 ${stats.comments.pending}`
                : card.key === "users"
                  ? "当前已注册用户数量"
                  : "最近活跃度指示器";
          return (
            <Card key={card.key} className="overflow-hidden">
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div>
                  <div className="text-sm text-muted-foreground">{card.title}</div>
                  <div className="mt-2 text-3xl font-semibold">{value}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{description}</div>
                </div>
                <div
                  className={`flex size-12 items-center justify-center rounded-3xl ${card.tone}`}
                >
                  <Icon className="size-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {usageQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Spinner /> 加载最近七日 AI 用量中…
          </CardContent>
        </Card>
      ) : usageQuery.error ? (
        <Alert tone="danger">加载 AI 用量失败：{getErrorMessage(usageQuery.error)}</Alert>
      ) : usageQuery.data ? (
        <DashboardUsagePanel usage={usageQuery.data} />
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>最近活动</CardTitle>
            <CardDescription>文章、评论与用户注册的近期变化。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> 加载活动中…
              </div>
            ) : activityQuery.error ? (
              <Alert tone="danger">{getErrorMessage(activityQuery.error)}</Alert>
            ) : activityQuery.data && activityQuery.data.length > 0 ? (
              activityQuery.data.map((item) => (
                <div
                  key={item.id}
                  className="rounded-3xl bg-muted/56 px-4 py-3 shadow-inner shadow-shadow-inset"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="outline">{item.type}</Badge>
                    {item.status ? <Badge tone="muted">{item.status}</Badge> : null}
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="mt-2 font-medium">{item.title ?? item.id}</div>
                  {item.content ? (
                    <div className="mt-1 text-sm text-muted-foreground">{item.content}</div>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState title="暂无活动" description="当前还没有可展示的后台活动记录。" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
