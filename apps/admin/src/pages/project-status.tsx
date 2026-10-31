import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
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
  Disclosure,
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

function isProblem(result: ProjectStatusResultDto) {
  return result.status !== "available" || result.freshness === "stale";
}

function problemLabel(result: ProjectStatusResultDto) {
  if (result.status === "unavailable") return "异常";
  if (result.status === "unknown") return "未知";
  return "stale";
}

function problemDetail(result: ProjectStatusResultDto) {
  if (result.status === "unknown") return "尚未完成成功检查，暂时不能确认入口状态。";
  if (result.errorMessage) return result.errorMessage;
  if (result.freshness === "stale") return "最近一次结果超过 12 小时未更新。";
  return `HTTP ${result.httpStatus ?? "-"} 返回异常。`;
}

function problemSort(left: ProjectStatusResultDto, right: ProjectStatusResultDto) {
  const rank = (result: ProjectStatusResultDto) => {
    if (result.status === "unavailable") return 0;
    if (result.status === "unknown") return 1;
    return 2;
  };
  return rank(left) - rank(right) || left.projectTitle.localeCompare(right.projectTitle, "zh-CN");
}

function ProblemEntry({ result }: { result: ProjectStatusResultDto }) {
  const iconSurface = result.status === "unavailable" ? "bg-destructive/10" : "bg-warning/12";

  return (
    <article className="rounded-2xl border border-border/58 bg-card/78 p-4 shadow-sm shadow-shadow-soft lg:rounded-[1rem]">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-full p-2 ${iconSurface}`}>
          <ResultIcon result={result} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{result.projectTitle}</h3>
            <Badge tone={resultTone(result)}>{problemLabel(result)}</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {result.entryLabel} · {result.domain}
          </p>
        </div>
        <Button
          asChild
          size="icon"
          variant="ghost"
          aria-label={`打开 ${result.entryLabel}`}
          title={`打开 ${result.entryLabel}`}
        >
          <a href={result.href} target="_blank" rel="noreferrer">
            <ArrowUpRight />
          </a>
        </Button>
      </div>
      <p className="mt-4 rounded-xl bg-destructive/7 px-3 py-2 text-sm leading-6 text-foreground">
        {problemDetail(result)}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{result.entryKind}</span>
        <span>HTTP {result.httpStatus ?? "-"}</span>
        <span>{result.attemptCount} 次尝试</span>
        <span>{result.latencyMs === null ? "无延迟数据" : `${result.latencyMs} ms`}</span>
        <span>{result.checkedAt ? formatDateTime(result.checkedAt) : "未检查"}</span>
      </div>
      {result.finalUrl && result.finalUrl !== result.href ? (
        <a
          className="mt-3 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
          href={result.finalUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className="truncate">重定向到 {result.finalUrl}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : null}
    </article>
  );
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
  const problemResults = filteredResults.filter(isProblem).sort(problemSort);
  const healthyResults = filteredResults.filter((result) => !isProblem(result));
  const totalProblems =
    (overview?.summary.unavailable ?? 0) +
    (overview?.summary.unknown ?? 0) +
    (overview?.summary.stale ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目入口状态"
        description="先定位需要处理的入口，再展开正常结果和历史批次。"
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

      <section className="rounded-3xl border border-destructive/24 bg-destructive/6 p-5 shadow-lg shadow-shadow-soft lg:rounded-[1.25rem] lg:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.6fr)] lg:items-center">
          <div>
            <div className="text-sm font-medium text-muted-foreground">当前需要处理</div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="text-5xl font-semibold tabular-nums text-destructive">
                {totalProblems}
              </div>
              <div className="text-sm text-muted-foreground">
                / {overview?.summary.total ?? 0} 个入口
              </div>
            </div>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {totalProblems > 0
                ? "红色异常优先处理；未知和 stale 需要确认检查是否完整。"
                : "当前没有需要处理的入口。"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["unavailable", "异常", overview?.summary.unavailable ?? 0, "danger"],
              ["unknown", "未知", overview?.summary.unknown ?? 0, "warning"],
              ["stale", "stale", overview?.summary.stale ?? 0, "warning"],
            ].map(([value, label, count, tone]) => (
              <Button
                key={value}
                variant="row"
                aria-pressed={filter === value}
                className={`justify-center ${filter === value ? "bg-card/80 shadow-sm" : "bg-card/38"}`}
                onClick={() => setFilter(value as Filter)}
              >
                <span
                  className={`text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : "text-warning"}`}
                >
                  {count}
                </span>
                <span className="text-sm">{label}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-destructive/15 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden />
            {overview?.summary.available ?? 0} 个可用
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden />
            {overview?.latestRun
              ? `最近批次 ${formatDateTime(overview.latestRun.finishedAt ?? overview.latestRun.startedAt)}`
              : "尚未完成检查"}
          </span>
        </div>
      </section>

      <section aria-labelledby="project-status-problems" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="project-status-problems" className="text-xl font-semibold">
              需要处理的入口
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {problemResults.length > 0
                ? `按异常优先显示 ${problemResults.length} 个入口，问题位置和原因直接列在每项下面。`
                : totalProblems > 0
                  ? "当前筛选下没有问题入口，尝试清除筛选。"
                  : "本批次所有入口均可用且结果仍在新鲜期。"}
            </p>
          </div>
          {filter !== "all" ? (
            <Button variant="quiet" size="sm" onClick={() => setFilter("all")}>
              清除结果筛选
            </Button>
          ) : null}
        </div>
        {overviewQuery.isPending ? (
          <div className="flex min-h-40 items-center justify-center rounded-3xl border border-border/52 bg-card/54 lg:rounded-[1rem]">
            <Spinner className="size-6" />
          </div>
        ) : problemResults.length === 0 ? (
          <EmptyState
            title={totalProblems > 0 ? "当前筛选没有问题" : "没有待处理问题"}
            description={
              totalProblems > 0
                ? "调整结果、领域、项目或入口类型筛选。"
                : "当前批次所有入口均返回可用结果。"
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {problemResults.map((result) => (
              <ProblemEntry key={result.entryKey} result={result} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>全部入口</CardTitle>
          <CardDescription>
            用筛选缩小范围；问题入口已在上方单独列出，正常入口默认收起。
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
          ) : filteredResults.length === 0 ? (
            <EmptyState title="没有匹配的入口" description="调整筛选条件后重试。" />
          ) : (
            <Disclosure
              defaultOpen={problemResults.length === 0}
              summary={
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-muted/48 px-3 py-2 text-foreground lg:rounded-[0.75rem]">
                  <span className="font-medium">查看 {healthyResults.length} 个正常入口</span>
                  <Badge tone="success">可用</Badge>
                </div>
              }
              summaryClassName="block"
            >
              <div className="divide-y divide-border/52 overflow-hidden rounded-2xl border border-border/52 bg-muted/16 lg:rounded-[1rem]">
                {healthyResults.map((result) => (
                  <div key={result.entryKey} className="flex items-center gap-3 px-4 py-3">
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-medium">{result.projectTitle}</span>
                        <span className="text-sm text-muted-foreground">{result.entryLabel}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{result.href}</div>
                    </div>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {result.latencyMs === null ? "-" : `${result.latencyMs} ms`}
                    </span>
                  </div>
                ))}
              </div>
            </Disclosure>
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
