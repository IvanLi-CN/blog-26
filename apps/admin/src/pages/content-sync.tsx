import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseCircle, PlayCircle, RefreshCcw, Sparkles } from "lucide-react";
import { adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CodeBlock,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { formatCount, formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

export function ContentSyncPage() {
  const queryClient = useQueryClient();

  const managerStatsQuery = useQuery({
    queryKey: ["content-sync-manager-stats"],
    queryFn: adminApi.getContentSyncManagerStats,
  });
  const contentStatsQuery = useQuery({
    queryKey: ["content-sync-content-stats"],
    queryFn: adminApi.getContentSyncContentStats,
  });
  const sourcesQuery = useQuery({
    queryKey: ["content-sync-sources"],
    queryFn: adminApi.getContentSyncSourcesStatus,
  });
  const progressQuery = useQuery({
    queryKey: ["content-sync-progress"],
    queryFn: adminApi.getContentSyncProgress,
    refetchInterval: 5_000,
  });
  const logsQuery = useQuery({
    queryKey: ["content-sync-logs"],
    queryFn: () => adminApi.getContentSyncLogs({ limit: 20 }),
  });
  const historyQuery = useQuery({
    queryKey: ["content-sync-history"],
    queryFn: () => adminApi.getContentSyncHistory({ limit: 10 }),
  });
  const vectorStatsQuery = useQuery({
    queryKey: ["content-sync-vector-stats"],
    queryFn: adminApi.getVectorizationStats,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["content-sync"] });
    managerStatsQuery.refetch();
    contentStatsQuery.refetch();
    sourcesQuery.refetch();
    progressQuery.refetch();
    logsQuery.refetch();
    historyQuery.refetch();
    vectorStatsQuery.refetch();
  };

  const syncMutation = useMutation({
    mutationFn: () => adminApi.triggerContentSync({}),
    onSuccess: refreshAll,
  });
  const cancelMutation = useMutation({
    mutationFn: adminApi.cancelContentSync,
    onSuccess: refreshAll,
  });
  const vectorizeMutation = useMutation({
    mutationFn: () => adminApi.triggerVectorizeAll({ isFull: true }),
    onSuccess: refreshAll,
  });

  const managerStats = (managerStatsQuery.data ?? {}) as {
    registeredSources?: number;
    enabledSources?: number;
    currentSyncStatus?: string;
    lastSyncTime?: number;
    totalSyncs?: number;
  };
  const contentStats = (contentStatsQuery.data ?? {}) as {
    total?: number;
    byType?: Record<string, { total: number; sources?: Record<string, number> }>;
  };
  const vectorStats = vectorStatsQuery.data ?? {};
  const progress = progressQuery.data;
  const busy = syncMutation.isPending || cancelMutation.isPending || vectorizeMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容同步"
        description="统一查看内容源健康、同步进度与向量化任务。"
        actions={
          <>
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCcw className="size-4" />
              刷新
            </Button>
            <Button onClick={() => syncMutation.mutate()} disabled={busy}>
              {syncMutation.isPending ? <Spinner /> : <PlayCircle className="size-4" />}
              触发同步
            </Button>
            <Button variant="secondary" onClick={() => vectorizeMutation.mutate()} disabled={busy}>
              {vectorizeMutation.isPending ? <Spinner /> : <Sparkles className="size-4" />}
              全量向量化
            </Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={busy}>
              {cancelMutation.isPending ? <Spinner /> : <PauseCircle className="size-4" />}
              取消
            </Button>
          </>
        }
      />

      {syncMutation.error ? (
        <Alert tone="danger">{getErrorMessage(syncMutation.error)}</Alert>
      ) : null}
      {cancelMutation.error ? (
        <Alert tone="danger">{getErrorMessage(cancelMutation.error)}</Alert>
      ) : null}
      {vectorizeMutation.error ? (
        <Alert tone="danger">{getErrorMessage(vectorizeMutation.error)}</Alert>
      ) : null}

      {progress ? (
        <Alert
          tone={progress.status === "running" ? "warning" : progress.error ? "danger" : "success"}
        >
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <span>当前状态：{progress.status}</span>
            <span>步骤：{progress.currentStep}</span>
            <span>进度：{Math.round(progress.progress)}%</span>
            <span>
              处理：{progress.processedItems}/{progress.totalItems}
            </span>
            {progress.error ? <span>错误：{progress.error}</span> : null}
          </div>
        </Alert>
      ) : (
        <Alert>当前没有活跃中的同步任务。</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          title="已注册源"
          value={formatCount(managerStats.registeredSources ?? 0)}
          description="当前内容源总数"
        />
        <MetricCard
          title="启用源"
          value={formatCount(managerStats.enabledSources ?? 0)}
          description="参与同步的源"
        />
        <MetricCard
          title="总内容量"
          value={formatCount(contentStats.total ?? 0)}
          description="来自 posts 表统计"
        />
        <MetricCard
          title="累计同步"
          value={formatCount(managerStats.totalSyncs ?? 0)}
          description={`最近一次 ${formatDateTime(managerStats.lastSyncTime)}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>内容源状态</CardTitle>
            <CardDescription>来源在线状态、优先级与最近同步时间。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {sourcesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> 读取中…
              </div>
            ) : sourcesQuery.error ? (
              <Alert tone="danger">{getErrorMessage(sourcesQuery.error)}</Alert>
            ) : (
              (sourcesQuery.data ?? []).map((source) => (
                <Card key={source.name} className="bg-muted/40 shadow-none">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{source.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {source.type} · priority {source.priority}
                        </div>
                      </div>
                      <Badge tone={source.online ? "success" : "danger"}>
                        {source.online ? "online" : "offline"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      已同步 {formatCount(source.totalItems)} 项
                    </div>
                    <div className="text-xs text-muted-foreground">
                      最近同步：{formatDateTime(source.lastSync)}
                    </div>
                    {source.error ? <Alert tone="danger">{source.error}</Alert> : null}
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>向量化摘要</CardTitle>
            <CardDescription>直接透出当前兼容层返回的统计结果。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge tone="outline">{managerStats.currentSyncStatus ?? "idle"}</Badge>
            <CodeBlock>{JSON.stringify(vectorStats, null, 2)}</CodeBlock>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card>
          <CardHeader>
            <CardTitle>按类型统计</CardTitle>
            <CardDescription>来自数据库的内容计数。</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto admin-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>总数</TableHead>
                  <TableHead>来源分布</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(contentStats.byType ?? {}).map(([type, item]) => (
                  <TableRow key={type}>
                    <TableCell className="font-medium">{type}</TableCell>
                    <TableCell>{formatCount(item.total)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {Object.entries(item.sources ?? {})
                        .map(([name, count]) => `${name}: ${count}`)
                        .join(" · ") || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近历史</CardTitle>
            <CardDescription>最近 10 次同步。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(historyQuery.data ?? []).map((entry) => (
              <div
                key={`${entry.startTime}-${entry.success}-${entry.duration}-${entry.sources.join("|")}`}
                className="rounded-xl border border-border bg-muted/60 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={entry.success ? "success" : "danger"}>
                    {entry.success ? "success" : "error"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.startTime)}
                  </span>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  来源：{entry.sources.join(", ") || "-"}
                </div>
                <div className="text-sm text-muted-foreground">
                  耗时：{formatCount(entry.duration)} ms · 错误 {entry.errorCount}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近日志</CardTitle>
          <CardDescription>从兼容层直接读取最近 20 条同步日志。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>消息</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logsQuery.data ?? []).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell>{log.sourceName}</TableCell>
                  <TableCell>{log.operation}</TableCell>
                  <TableCell>
                    <Badge
                      tone={
                        log.status === "success"
                          ? "success"
                          : log.status === "error"
                            ? "danger"
                            : "outline"
                      }
                    >
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[520px] text-sm text-muted-foreground">
                    {log.message}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="text-3xl font-semibold">{value}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </CardContent>
    </Card>
  );
}
