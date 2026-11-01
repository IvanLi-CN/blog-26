import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Search, ShieldCheck, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { type AdminUsageUser, adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { formatCount, getErrorMessage, PageHeader } from "~/pages/helpers";

function tokenLine(metric: AdminUsageUser["usage"]["hour"]) {
  return `${formatCount(metric.totalTokens)} Token`;
}

function metricQualityLine(metric: AdminUsageUser["usage"]["hour"]) {
  const quality = [
    metric.estimatedCallCount ? `估算 ${formatCount(metric.estimatedCallCount)}` : null,
    metric.missingCallCount ? `缺失 ${formatCount(metric.missingCallCount)}` : null,
  ].filter(Boolean);
  return quality.length ? quality.join(" · ") : "用量完整";
}

function quotaLabel(user: AdminUsageUser) {
  if (user.quotaStatus === "unlimited") return "管理员 · 不限个人额度";
  if (user.quotaStatus === "exhausted") return "额度已用尽";
  return `小时 ${formatCount(Math.max(0, user.quota.policy.tokenHourlyLimit - user.quota.tokenHour))} · 七日 ${formatCount(Math.max(0, user.quota.policy.tokenWeeklyLimit - user.quota.tokenWeek))}`;
}

function UserRow({
  user,
  onReset,
}: {
  user: AdminUsageUser;
  onReset: (user: AdminUsageUser, returnFocusRef: { current: HTMLElement | null }) => void;
}) {
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  return (
    <TableRow data-testid={`admin-user-row-${user.id}`}>
      <TableCell>
        <div className="flex min-w-48 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            {user.isAdmin ? <ShieldCheck className="size-4" /> : <UserRound className="size-4" />}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{user.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {user.email ?? "未提供邮箱"}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {user.identityProviders.map((provider) => (
                <Badge key={provider} tone="muted">
                  {provider}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="font-medium">{tokenLine(user.usage.hour)}</div>
        <div className="text-xs text-muted-foreground">
          输入 {formatCount(user.usage.hour.inputTokens)} · 输出{" "}
          {formatCount(user.usage.hour.outputTokens)}
        </div>
        <div className="text-xs text-muted-foreground">{metricQualityLine(user.usage.hour)}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="font-medium">{tokenLine(user.usage.week)}</div>
        <div className="text-xs text-muted-foreground">
          输入 {formatCount(user.usage.week.inputTokens)} · 输出{" "}
          {formatCount(user.usage.week.outputTokens)}
        </div>
        <div className="text-xs text-muted-foreground">{metricQualityLine(user.usage.week)}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="font-medium">{tokenLine(user.usage.allTime)}</div>
        <div className="text-xs text-muted-foreground">
          输入 {formatCount(user.usage.allTime.inputTokens)} · 输出{" "}
          {formatCount(user.usage.allTime.outputTokens)}
        </div>
        <div className="text-xs text-muted-foreground">
          调用 {formatCount(user.usage.allTime.callCount)} 次 ·{" "}
          {metricQualityLine(user.usage.allTime)}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex min-w-44 flex-col items-start gap-2">
          <Badge
            tone={
              user.quotaStatus === "exhausted"
                ? "danger"
                : user.quotaStatus === "unlimited"
                  ? "success"
                  : "outline"
            }
          >
            {user.quotaStatus === "exhausted"
              ? "需要恢复"
              : user.quotaStatus === "unlimited"
                ? "管理员"
                : "额度正常"}
          </Badge>
          <span className="text-xs leading-5 text-muted-foreground">{quotaLabel(user)}</span>
          {user.quotaStatus !== "unlimited" ? (
            <Button
              ref={resetTriggerRef}
              size="sm"
              variant="outline"
              onClick={() => onReset(user, resetTriggerRef)}
            >
              <RotateCcw className="size-4" />
              恢复额度
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState<AdminUsageUser | null>(null);
  const resetFocusRef = useRef<HTMLElement | null>(null);
  const usersQuery = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => adminApi.listUsers(search.trim() || undefined),
  });
  const resetMutation = useMutation({
    mutationFn: (userId: string) => adminApi.resetUserQuota(userId),
    onSuccess: () => {
      setResetTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  return (
    <div className="space-y-6" data-testid="admin-users-page">
      <PageHeader title="后台用户" description="查看前台用户的全站 AI 消耗与个人助手额度状态。" />
      <Card>
        <CardHeader>
          <CardTitle>用户用量</CardTitle>
          <CardDescription>
            小时、七日和累计列是全站 AI 调用；额度状态只代表个人助手配额。
          </CardDescription>
          <div className="relative mt-2 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              aria-label="搜索用户"
              placeholder="搜索昵称或邮箱"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          {usersQuery.isLoading ? (
            <EmptyState title="正在加载用户" action={<Spinner className="size-6" />} />
          ) : null}
          {usersQuery.error ? (
            <Alert tone="danger">加载用户失败：{getErrorMessage(usersQuery.error)}</Alert>
          ) : null}
          {!usersQuery.isLoading && !usersQuery.error ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>最近一小时</TableHead>
                  <TableHead>最近七日</TableHead>
                  <TableHead>累计</TableHead>
                  <TableHead>个人额度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersQuery.data?.users ?? []).map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onReset={(target, returnFocusRef) => {
                      resetMutation.reset();
                      resetFocusRef.current = returnFocusRef.current;
                      setResetTarget(target);
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          ) : null}
          {usersQuery.data?.users.length === 0 ? (
            <EmptyState title="没有匹配的用户" description="调整搜索条件后重试。" />
          ) : null}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
        title="恢复单用户额度"
        error={
          resetMutation.error ? (
            <Alert tone="danger">恢复额度失败：{getErrorMessage(resetMutation.error)}</Alert>
          ) : undefined
        }
        description={
          resetTarget
            ? `${resetTarget.displayName} 的小时和七日个人额度将从新周期开始计算。真实历史、累计统计和全局策略不会被清除。`
            : undefined
        }
        confirmLabel="恢复额度"
        confirmPending={resetMutation.isPending}
        confirmPendingLabel="正在恢复"
        returnFocusRef={resetFocusRef}
        onConfirm={async () => {
          if (resetTarget) await resetMutation.mutateAsync(resetTarget.id);
        }}
      />
    </div>
  );
}
