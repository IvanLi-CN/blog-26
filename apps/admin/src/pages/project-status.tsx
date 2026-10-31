import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCcw,
  Timer,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import type { ProjectStatusResultDto, ProjectStatusResultStatus } from "@/lib/project-status";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

type Filter = "all" | ProjectStatusResultStatus | "stale";

function resultTone(result: ProjectStatusResultDto) {
  if (result.status === "available" && result.freshness === "fresh") return "success" as const;
  if (result.status === "unavailable") return "danger" as const;
  return "warning" as const;
}

function resultLabel(result: ProjectStatusResultDto) {
  if (result.status === "available") return result.freshness === "stale" ? "可用 · stale" : "可用";
  if (result.status === "unavailable") return "异常";
  return "未知";
}

function ResultIcon({ result }: { result: ProjectStatusResultDto }) {
  if (result.status === "available" && result.freshness === "fresh") {
    return <CheckCircle2 className="size-4 text-success" aria-hidden />;
  }
  if (result.status === "unavailable") {
    return <XCircle className="size-4 text-destructive" aria-hidden />;
  }
  return <AlertTriangle className="size-4 text-warning" aria-hidden />;
}

function statusLabel(status: string) {
  return (
    (
      {
        completed: "完成",
        partial: "部分完成",
        interrupted: "已中断",
        error: "失败",
        running: "检查中",
      } as Record<string, string>
    )[status] ?? status
  );
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "partial" || status === "running") return "warning" as const;
  return status === "error" ? ("danger" as const) : ("muted" as const);
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "进行中";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function groupResults(results: ProjectStatusResultDto[]) {
  const domains = new Map<string, Map<string, ProjectStatusResultDto[]>>();
  for (const result of results) {
    const projects = domains.get(result.domain) ?? new Map<string, ProjectStatusResultDto[]>();
    const entries = projects.get(result.projectSlug) ?? [];
    entries.push(result);
    projects.set(result.projectSlug, entries);
    domains.set(result.domain, projects);
  }
  return [...domains.entries()];
}

export function ProjectStatusPage() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("all");
  const [project, setProject] = useState("all");
  const [kind, setKind] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const overviewQuery = useQuery({
    queryKey: ["admin-project-status-overview"],
    queryFn: adminApi.getProjectStatusOverview,
    refetchInterval: (current) => (current.state.data?.activeRun ? 2000 : false),
  });
  const historyQuery = useQuery({
    queryKey: ["admin-project-status-history"],
    queryFn: () => adminApi.getProjectStatusHistory(30),
  });
  const triggerMutation = useMutation({
    mutationFn: adminApi.triggerProjectStatusCheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-project-status-overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin-project-status-history"] });
    },
  });

  const overview = overviewQuery.data;
  const filteredResults = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (overview?.results ?? [])
      .filter((result) => domain === "all" || result.domain === domain)
      .filter((result) => project === "all" || result.projectSlug === project)
      .filter((result) => kind === "all" || result.entryKind === kind)
      .filter(
        (result) => filter === "all" || result.status === filter || result.freshness === filter
      )
      .filter((result) => {
        if (!text) return true;
        return [result.projectTitle, result.entryLabel, result.href].some((value) =>
          value.toLowerCase().includes(text)
        );
      })
      .sort((left, right) => {
        const anomaly = (result: ProjectStatusResultDto) =>
          result.status === "unavailable"
            ? 0
            : result.status === "unknown" || result.freshness === "stale"
              ? 1
              : 2;
        return (
          anomaly(left) - anomaly(right) ||
          left.projectTitle.localeCompare(right.projectTitle, "zh-CN")
        );
      });
  }, [domain, filter, kind, overview?.results, project, query]);

  const projectOptions = useMemo(
    () => [
      ...new Map((overview?.catalog ?? []).map((entry) => [entry.projectSlug, entry.projectTitle])),
    ],
    [overview?.catalog]
  );
  const domainOptions = useMemo(
    () => [...new Map((overview?.catalog ?? []).map((entry) => [entry.domain, entry.domain]))],
    [overview?.catalog]
  );
  const groups = groupResults(filteredResults);

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目入口状态"
        description="检查共享项目目录中的全部外部入口，保留 30 天批次历史。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                overviewQuery.refetch();
                historyQuery.refetch();
              }}
              disabled={overviewQuery.isFetching || historyQuery.isFetching}
            >
              <RefreshCcw className="size-4" />
              刷新
            </Button>
            <Button
              onClick={() => triggerMutation.mutate()}
              disabled={Boolean(overview?.activeRun) || triggerMutation.isPending}
            >
              {triggerMutation.isPending || overview?.activeRun ? (
                <Spinner />
              ) : (
                <Timer className="size-4" />
              )}
              {overview?.activeRun ? "检查中" : "手动检查"}
            </Button>
          </>
        }
      />

      {overviewQuery.error ? (
        <Alert tone="danger">{getErrorMessage(overviewQuery.error)}</Alert>
      ) : null}
      {historyQuery.error ? (
        <Alert tone="danger">{getErrorMessage(historyQuery.error)}</Alert>
      ) : null}
      {triggerMutation.error ? (
        <Alert tone="danger">{getErrorMessage(triggerMutation.error)}</Alert>
      ) : null}
      {overview?.activeRun ? (
        <Alert tone="warning">
          批次正在运行：已处理 {overview.activeRun.attemptedCount} /{" "}
          {overview.activeRun.targetCount} 个入口，页面会自动刷新。
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["全部入口", overview?.summary.total ?? 0, "outline"],
          ["可用", overview?.summary.available ?? 0, "success"],
          ["异常", overview?.summary.unavailable ?? 0, "danger"],
          ["未知", overview?.summary.unknown ?? 0, "warning"],
          ["stale", overview?.summary.stale ?? 0, "warning"],
        ].map(([label, value, tone]) => (
          <Card key={String(label)}>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-3xl font-semibold tabular-nums">{value}</div>
                <Badge tone={tone as "outline" | "success" | "danger" | "warning"}>{label}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>入口结果</CardTitle>
          <CardDescription>
            {overview?.latestRun
              ? `最近批次 ${formatDateTime(overview.latestRun.finishedAt ?? overview.latestRun.startedAt)} · ${statusLabel(overview.latestRun.status)}`
              : "尚未完成检查，当前入口状态为未知。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索项目、入口或 URL"
              aria-label="搜索入口"
            />
            <Select value={domain} onValueChange={setDomain} aria-label="筛选领域">
              <option value="all">全部领域</option>
              {domainOptions.map(([value]) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
            <Select value={project} onValueChange={setProject} aria-label="筛选项目">
              <option value="all">全部项目</option>
              {projectOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select value={kind} onValueChange={setKind} aria-label="筛选类型">
              <option value="all">全部类型</option>
              <option value="site">项目站点</option>
              <option value="demo">Demo</option>
              <option value="officialDocs">官方文档</option>
              <option value="docs">文档</option>
              <option value="repository">开源仓库</option>
            </Select>
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as Filter)}
              aria-label="筛选结果"
            >
              <option value="all">全部结果</option>
              <option value="unavailable">异常优先</option>
              <option value="unknown">未知</option>
              <option value="stale">stale</option>
              <option value="available">可用</option>
            </Select>
          </div>

          {overviewQuery.isPending ? (
            <div className="flex min-h-48 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState title="没有匹配的入口" description="调整筛选条件后重试。" />
          ) : (
            <div className="space-y-5">
              {groups.map(([domainKey, projects]) => (
                <section key={domainKey} className="space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-border/58 pb-2">
                    <h3 className="font-semibold">{domainKey}</h3>
                    <Badge tone="muted">{[...projects.values()].flat().length} 个入口</Badge>
                  </div>
                  {[...projects.entries()].map(([projectSlug, results]) => (
                    <div
                      key={projectSlug}
                      className="overflow-hidden rounded-2xl border border-border/52 bg-muted/18"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-border/46 px-4 py-3">
                        <div className="font-medium">{results[0]?.projectTitle}</div>
                        <Badge tone="muted">{results.length} 个入口</Badge>
                      </div>
                      <div className="overflow-x-auto">
                        <Table className="min-w-[820px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>入口</TableHead>
                              <TableHead>URL</TableHead>
                              <TableHead>状态</TableHead>
                              <TableHead>检查信息</TableHead>
                              <TableHead>错误</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {results.map((result) => (
                              <TableRow key={result.entryKey}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <ResultIcon result={result} />
                                    <div>
                                      <div className="font-medium">{result.entryLabel}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {result.entryKind}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[280px]">
                                  <a
                                    className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline"
                                    href={result.href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <span className="truncate">{result.href}</span>
                                    <ExternalLink className="size-3 shrink-0" />
                                  </a>
                                  {result.finalUrl && result.finalUrl !== result.href ? (
                                    <div className="mt-1 truncate text-xs text-muted-foreground">
                                      最终：{result.finalUrl}
                                    </div>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  <Badge tone={resultTone(result)}>{resultLabel(result)}</Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                  HTTP {result.httpStatus ?? "-"} ·{" "}
                                  {result.latencyMs === null ? "-" : `${result.latencyMs} ms`}
                                  <br />
                                  {result.attemptCount} 次 · {formatDateTime(result.checkedAt)}
                                </TableCell>
                                <TableCell className="max-w-[190px] text-xs text-muted-foreground">
                                  {result.errorMessage ?? "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>检查历史</CardTitle>
          <CardDescription>保存最近 30 天的批次结果。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>批次</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>目标</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>开始时间</TableHead>
                  <TableHead>耗时</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historyQuery.data?.runs ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs">{run.id.slice(0, 8)}</TableCell>
                    <TableCell>{run.triggeredBy === "manual" ? "手动" : "定时"}</TableCell>
                    <TableCell>
                      <Badge tone={statusTone(run.status)}>{statusLabel(run.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      {run.attemptedCount} / {run.targetCount}
                    </TableCell>
                    <TableCell>
                      {run.availableCount} 可用 · {run.unavailableCount} 异常
                    </TableCell>
                    <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                    <TableCell>{formatDuration(run.durationMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
