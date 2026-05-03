import { useQuery } from "@tanstack/react-query";
import { Activity, FileText, MessageSquareMore, Users } from "lucide-react";
import { adminApi } from "@/lib/admin-api-client";
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
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

const statCards = [
  { key: "posts", title: "文章总数", icon: FileText, accent: "from-sky-500/20 to-sky-500/5" },
  {
    key: "comments",
    title: "评论总数",
    icon: MessageSquareMore,
    accent: "from-fuchsia-500/20 to-fuchsia-500/5",
  },
  { key: "users", title: "注册用户", icon: Users, accent: "from-emerald-500/20 to-emerald-500/5" },
  {
    key: "activity",
    title: "验证码请求",
    icon: Activity,
    accent: "from-amber-500/20 to-amber-500/5",
  },
] as const;

export function DashboardPage() {
  const statsQuery = useQuery({ queryKey: ["dashboard-stats"], queryFn: adminApi.dashboardStats });
  const activityQuery = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => adminApi.dashboardRecentActivity(12),
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
            <Card key={card.key} className={`bg-gradient-to-br ${card.accent}`}>
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div>
                  <div className="text-sm text-muted-foreground">{card.title}</div>
                  <div className="mt-2 text-3xl font-semibold">{value}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{description}</div>
                </div>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white/5 text-primary">
                  <Icon className="size-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
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
                <div key={item.id} className="rounded-2xl border border-border bg-muted px-4 py-3">
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

        <Card>
          <CardHeader>
            <CardTitle>阶段提醒</CardTitle>
            <CardDescription>这一版后台只走 `/api/admin/*`。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <Alert>编辑器附件仍阶段性保留 `/api/files/*`，后续再移交 Rust 端。</Alert>
            <div>· `/admin/*` 页面由 admin SPA 和 gateway 统一承载。</div>
            <div>· `/admin/login` 已废弃，权限由 gateway 与会话统一处理。</div>
            <div>· `/memos` 管理操作暂时留在公开站，不在本次 IA 范围内。</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
