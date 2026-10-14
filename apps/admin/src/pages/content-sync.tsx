import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, PauseCircle, PlayCircle, RefreshCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  adminApi,
  type PlaybookContentSyncStatus,
  type UnifiedContentSyncStatus,
  type VectorizationStats,
} from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { formatCount, formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

function compactEdition(value?: string | null) {
  if (!value) return "-";
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

export function PlaybookStatusDetails({ playbook }: { playbook: PlaybookContentSyncStatus }) {
  return (
    <dl className="grid min-w-0 gap-x-5 gap-y-3 text-sm text-muted-foreground sm:grid-cols-2">
      <div className="min-w-0 space-y-1">
        <dt className="text-xs">内容采用</dt>
        <dd className="font-medium text-foreground">{playbook.adopted ? "已采用" : "未采用"}</dd>
      </div>
      <div className="min-w-0 space-y-1">
        <dt className="text-xs">词法索引</dt>
        <dd className="font-medium text-foreground">
          {playbook.lexical.status} · {formatCount(playbook.lexical.count)} 项
        </dd>
      </div>
      <div className="min-w-0 space-y-1">
        <dt className="text-xs">语义投影</dt>
        <dd className="flex flex-wrap gap-x-2 gap-y-1 font-medium text-foreground">
          <span>{formatCount(playbook.semantic.ready)} ready</span>
          <span>{formatCount(playbook.semantic.pending)} pending</span>
          <span>{formatCount(playbook.semantic.failed)} failed</span>
        </dd>
      </div>
      <div className="min-w-0 space-y-1">
        <dt className="text-xs">模型</dt>
        <dd className="truncate font-medium text-foreground" title={playbook.semantic.model}>
          {playbook.semantic.model}
        </dd>
      </div>
      <div className="min-w-0 space-y-1 sm:col-span-2">
        <dt className="text-xs">当前 edition</dt>
        <dd
          className="truncate font-mono text-xs font-medium text-foreground"
          title={playbook.current?.edition ?? undefined}
        >
          {compactEdition(playbook.current?.edition)}
        </dd>
      </div>
      <div className="min-w-0 space-y-1 sm:col-span-2">
        <dt className="text-xs">历史</dt>
        <dd className="font-medium text-foreground">
          {formatCount(playbook.editions.length)} 个已知 edition ·{" "}
          {formatCount(playbook.history.length)} 条记录
        </dd>
      </div>
    </dl>
  );
}

export function ContentSyncActions({
  busy,
  syncing,
  playbookSyncing,
  vectorizing,
  cancelling,
  onSync,
  onPlaybookSync,
  onVectorize,
  onCancel,
}: {
  busy: boolean;
  syncing: boolean;
  playbookSyncing: boolean;
  vectorizing: boolean;
  cancelling: boolean;
  onSync: () => void;
  onPlaybookSync: () => void;
  onVectorize: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Button variant="outline" onClick={onSync} disabled={busy}>
        {syncing ? <Spinner /> : <PlayCircle className="size-4" />}
        触发同步
      </Button>
      <Button variant="outline" onClick={onPlaybookSync} disabled={busy}>
        {playbookSyncing ? <Spinner /> : <BookOpen className="size-4" />}
        刷新 Playbook
      </Button>
      <Button variant="secondary" onClick={onVectorize} disabled={busy}>
        {vectorizing ? <Spinner /> : <Sparkles className="size-4" />}
        全量向量化
      </Button>
      <Button variant="destructive" onClick={onCancel} disabled={busy}>
        {cancelling ? <Spinner /> : <PauseCircle className="size-4" />}
        取消
      </Button>
    </>
  );
}

export function RagCoverageGrid({
  stats,
  available = true,
}: {
  stats: UnifiedContentSyncStatus["rag"]["contents"];
  available?: boolean;
}) {
  const metrics = [
    ["总量", stats.total],
    ["已索引", available ? stats.indexed : null],
    ["未索引", available ? stats.unindexed : null],
    ["过时", available ? stats.outdated : null],
    ["失败", available ? stats.failed : null],
    [
      "覆盖率",
      available && stats.coverage !== null ? `${(stats.coverage * 100).toFixed(1)}%` : null,
    ],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="rag-coverage">
      {metrics.map(([label, value]) => (
        <div className="min-w-0 rounded-2xl bg-muted/46 p-3" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {value === null ? "—" : typeof value === "number" ? formatCount(value) : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ContentSyncPage() {
  const queryClient = useQueryClient();
  const [source, setSource] = useState<"all" | "blog" | "playbook">("all");
  const [edition, setEdition] = useState<"current" | "previous">("current");
  const statusQuery = useQuery({
    queryKey: ["content-sync", source, edition],
    queryFn: () => adminApi.getContentSyncStatus({ source, edition }),
    refetchInterval: 5000,
  });
  const logsQuery = useQuery({
    queryKey: ["content-sync", "logs"],
    queryFn: () => adminApi.getContentSyncLogs({ limit: 20 }),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["content-sync"] });
  };
  const sync = useMutation({
    mutationFn: (target: "local" | "playbook") => adminApi.triggerContentSync({ source: target }),
    onSuccess: refresh,
  });
  const index = useMutation({
    mutationFn: (mode: "repair" | "rebuild") => adminApi.triggerRagIndex(source, mode),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: adminApi.cancelContentTask, onSuccess: refresh });
  const data = statusQuery.data;
  const active = data?.tasks.items.filter((task) => task.finishedAt === null) ?? [];
  const count = (value?: number | null) =>
    value === undefined || value === null ? "—" : formatCount(value);
  return (
    <div className="space-y-6">
      <PageHeader
        title="内容同步"
        description="查看已收录内容、公开 RAG 覆盖与持久任务。"
        actions={
          <>
            <Button variant="outline" onClick={refresh}>
              <RefreshCcw className="size-4" />
              刷新
            </Button>
            <Button
              variant="outline"
              disabled={
                sync.isPending ||
                active.some((task) => task.kind === "sync" && task.source === "local")
              }
              onClick={() => sync.mutate("local")}
            >
              <PlayCircle className="size-4" />
              同步本地内容
            </Button>
            <Button
              variant="outline"
              disabled={
                sync.isPending ||
                active.some((task) => task.kind === "sync" && task.source === "playbook") ||
                data?.sources.find((item) => item.name === "playbook")?.enabled === false
              }
              onClick={() => sync.mutate("playbook")}
            >
              <BookOpen className="size-4" />
              刷新 Playbook
            </Button>
          </>
        }
      />
      {statusQuery.isLoading ? (
        <Alert>
          <Spinner /> 读取内容与索引状态…
        </Alert>
      ) : statusQuery.error ? (
        <Alert tone="danger">
          状态读取失败：{getErrorMessage(statusQuery.error)}。数值不可得，请重试刷新。
        </Alert>
      ) : null}
      {[
        { key: "sync", error: sync.error },
        { key: "index", error: index.error },
        { key: "cancel", error: cancel.error },
      ]
        .filter((item) => item.error)
        .map(({ key, error }) => (
          <Alert key={key} tone="danger">
            {getErrorMessage(error)}
          </Alert>
        ))}
      {index.data?.results
        .filter((result) => result.error)
        .map((result) => (
          <Alert key={result.source} tone="danger">
            {result.source}：{result.error}
          </Alert>
        ))}
      {data && !active.length ? <Alert>当前没有活跃任务；刷新只读取状态。</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="已注册源"
          value={count(data?.summary.registeredSources)}
          description="local 与 Playbook"
        />
        <MetricCard
          title="启用源"
          value={count(data?.summary.enabledSources)}
          description="实际同步配置；停用保留缓存"
        />
        <MetricCard
          title="总内容量"
          value={count(data?.summary.total)}
          description="当前采用的唯一内容，含本地 project"
        />
        <MetricCard
          title="累计同步"
          value={count(data?.summary.totalSyncs)}
          description={
            data?.summary.trackingSince
              ? `自 ${formatDateTime(data.summary.trackingSince)} 记录；此前未知`
              : "累计记录起点未知"
          }
        />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>内容源状态</CardTitle>
            <CardDescription>
              收录数量与 RAG 总量不同；章节、资源和上一版不重复收录。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.sources.map((item) => {
              const ragSource = data.rag.bySource.find(
                (row) => row.source === (item.name === "local" ? "blog" : "playbook")
              );
              return (
                <div key={item.name} className="min-w-0 space-y-3 rounded-2xl bg-muted/46 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{item.name}</span>
                    <Badge tone={item.enabled ? "success" : "outline"}>
                      {item.enabled ? "同步启用" : "同步停用"}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    已收录 {count(item.total)} 项
                    {item.name === "playbook"
                      ? ` · ${data.playbook.adopted ? "内容已采用 · 词法就绪" : "未采用"}`
                      : ""}
                  </div>
                  {ragSource && source !== "all" && source === ragSource.source && (
                    <p className="text-sm text-muted-foreground">
                      本次 RAG 范围：{count(ragSource.contents.indexed)}/
                      {count(ragSource.contents.total)} 项完整索引
                    </p>
                  )}
                  <details className="text-sm text-muted-foreground">
                    <summary className="cursor-pointer">身份与最近记录</summary>
                    <dl className="mt-3 space-y-2">
                      <div>
                        <dt>最近检查</dt>
                        <dd>{formatDateTime(item.lastCheckAt)}</dd>
                      </div>
                      <div>
                        <dt>最近成功同步</dt>
                        <dd>{formatDateTime(item.lastSuccessAt)}</dd>
                      </div>
                      {item.name === "playbook" && (
                        <>
                          <div>
                            <dt>采用时间</dt>
                            <dd>
                              {data.playbook.adoptedAt
                                ? formatDateTime(data.playbook.adoptedAt)
                                : "未知"}
                            </dd>
                          </div>
                          <div>
                            <dt>当前 edition</dt>
                            <dd className="break-all font-mono text-xs">
                              {data.playbook.current?.editionDigest ?? "不可用"}
                            </dd>
                          </div>
                          <div>
                            <dt>Release / tag</dt>
                            <dd className="break-all">
                              {data.playbook.current?.source.releaseId} /{" "}
                              {data.playbook.current?.source.tag}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </details>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>RAG 索引覆盖</CardTitle>
            <CardDescription>
              主卡按唯一公开内容；全部预期分块有效才算已索引。本地 project 不计入。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <fieldset aria-label="RAG 范围" className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "全部"],
                    ["blog", "博客"],
                    ["playbook", "Playbook"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={source === value ? "default" : "outline"}
                    className="rounded-full!"
                    aria-pressed={source === value}
                    onClick={() => {
                      setSource(value);
                      setEdition("current");
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </fieldset>
              {source === "playbook" && (
                <label className="flex items-center gap-2 text-sm">
                  版本
                  <select
                    aria-label="Playbook 版本"
                    className="rounded-lg border bg-background p-2"
                    value={edition}
                    onChange={(event) => setEdition(event.target.value as typeof edition)}
                  >
                    <option value="current">当前版</option>
                    <option value="previous">上一版详情</option>
                  </select>
                </label>
              )}
            </div>
            {data?.rag.reason && (
              <Alert tone="warning">
                {data.rag.reason === "embedding-unconfigured"
                  ? "Embedding 未配置；覆盖状态不可得。"
                  : "所选 Playbook 快照不可用。"}
              </Alert>
            )}
            {data && (
              <>
                <RagCoverageGrid
                  stats={data.rag.contents}
                  available={data.rag.available && !data.rag.missingSources.length}
                />
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">分块与投影详情</summary>
                  <div className="mt-4 space-y-3">
                    <RagCoverageGrid
                      stats={data.rag.chunks}
                      available={data.rag.available && !data.rag.missingSources.length}
                    />
                    <dl className="space-y-2 text-muted-foreground">
                      <div>
                        <dt>模型</dt>
                        <dd className="break-all">{data.rag.identity.model || "未配置"}</dd>
                      </div>
                      <div>
                        <dt>配置指纹</dt>
                        <dd className="break-all font-mono text-xs">
                          {data.rag.identity.fingerprint}
                        </dd>
                      </div>
                      <div>
                        <dt>最近索引</dt>
                        <dd>{formatDateTime(data.rag.lastIndexedAt)}</dd>
                      </div>
                      <div>
                        <dt>绑定 edition</dt>
                        <dd className="break-all font-mono text-xs">
                          {data.rag.identity.playbook?.edition ?? "不适用"}
                        </dd>
                      </div>
                    </dl>
                    {data.rag.details
                      .filter((row) => row.error)
                      .map((row) => (
                        <p key={row.id} className="break-words text-danger">
                          {row.slug}：{row.error}
                        </p>
                      ))}
                  </div>
                </details>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={index.isPending || !data?.rag.available || edition === "previous"}
                onClick={() => index.mutate("repair")}
              >
                <Sparkles className="size-4" />
                补建缺失 / 过时 / 失败
              </Button>
              <Button
                variant="outline"
                disabled={index.isPending || !data?.rag.available || edition === "previous"}
                onClick={() => index.mutate("rebuild")}
              >
                重建所选来源全部分块
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              内容采用无需等待索引完成；补建保留有效分块。任务取消保留已成功部分。
            </p>
            {data && (
              <p className="text-xs text-muted-foreground">
                搜索策略状态：
                {data.policy.rag.available ? "RAG 可用" : (data.policy.rag.reason ?? "未知")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>任务与历史</CardTitle>
          <CardDescription>持久来源任务；内容同步与 RAG 准备分别记录。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.tasks.items.map((task) => (
            <div key={task.id} className="min-w-0 rounded-2xl bg-muted/46 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {task.source} · {task.kind === "rag" ? "RAG 索引" : "内容同步"}
                  </span>
                  <Badge tone={task.status === "failed" ? "danger" : "outline"}>
                    {task.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {task.phase} · {task.processed}/{task.total} · 失败 {task.failed}
                  </span>
                </div>
                {task.finishedAt === null && (
                  <Button
                    variant="destructive"
                    disabled={cancel.isPending || task.cancelRequested}
                    onClick={() => cancel.mutate(task.id)}
                  >
                    <PauseCircle className="size-4" />
                    {task.cancelRequested ? "取消中" : "取消此任务"}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {formatDateTime(task.startedAt)} · {task.origin}
              </p>
              {task.error && <p className="mt-2 text-sm text-danger">{task.error}</p>}
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">任务身份</summary>
                <p className="mt-2 break-all font-mono">{task.id}</p>
              </details>
            </div>
          ))}
          {data && !data.tasks.items.length && (
            <p className="text-sm text-muted-foreground">暂无持久任务记录；此前累计未知。</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>按类型统计</CardTitle>
          <CardDescription>当前采用的唯一内容。</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(data?.content.byType ?? {}).map(([type, total]) => (
              <div key={type}>
                <dt className="text-sm text-muted-foreground">{type}</dt>
                <dd className="font-semibold">{count(total)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>最近日志</CardTitle>
          <CardDescription>日志不计入累计同步。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {logsQuery.error ? (
            <Alert tone="danger">日志读取失败</Alert>
          ) : (
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
                {logsQuery.data?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.sourceName}</TableCell>
                    <TableCell>{log.operation}</TableCell>
                    <TableCell>{log.status}</TableCell>
                    <TableCell>{log.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function VectorizationStatsGrid({ stats }: { stats: VectorizationStats }) {
  const items = [
    { label: "已索引", value: stats.indexed, tone: "text-success" },
    { label: "待处理", value: stats.unindexed, tone: "text-warning" },
    { label: "需更新", value: stats.outdated, tone: "text-secondary" },
    { label: "最近更新", value: formatDateTime(stats.lastIndexedAt), tone: "text-foreground" },
  ] as const;

  return (
    <dl className="grid gap-3 sm:grid-cols-2" data-testid="vectorization-stats">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl bg-muted/46 p-3 shadow-inner shadow-shadow-inset"
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className={`mt-1 font-semibold ${item.tone}`}>
            {typeof item.value === "number" ? formatCount(item.value) : item.value}
          </dd>
        </div>
      ))}
    </dl>
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
