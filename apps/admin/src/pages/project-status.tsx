import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
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
  const problemResults = filteredResults.filter(isProblem);
  const totalProblems =
    (overview?.summary.unavailable ?? 0) +
    (overview?.summary.unknown ?? 0) +
    (overview?.summary.stale ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目入口状态"
        description="完整入口结果默认显示，异常、未知和 stale 排在表格顶部。"
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

      <section aria-labelledby="project-status-results" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="project-status-results" className="text-xl font-semibold">
              全部入口
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredResults.length > 0
                ? `共 ${filteredResults.length} 个入口；${problemResults.length} 个问题排在最前，项目、状态、原因和检查信息在同一行对照。`
                : totalProblems > 0
                  ? "当前筛选没有匹配的入口，尝试清除筛选。"
                  : "本批次尚未产生入口结果。"}
            </p>
          </div>
          {filter !== "all" ? (
            <Button variant="quiet" size="sm" onClick={() => setFilter("all")}>
              清除结果筛选
            </Button>
          ) : null}
        </div>
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
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border/52 bg-card/54">
            <Spinner className="size-6" />
          </div>
        ) : filteredResults.length === 0 ? (
          <EmptyState title="没有匹配的入口" description="调整筛选条件后重试。" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/58 bg-card/72 lg:rounded-[1rem]">
            <Table className="table-fixed md:min-w-[1120px]">
              <caption className="sr-only">全部项目入口状态（问题优先）</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%] md:w-[20%]">项目 / 入口</TableHead>
                  <TableHead className="hidden md:table-cell md:w-[24%]">目标 URL</TableHead>
                  <TableHead className="w-[18%] md:w-[12%]">状态</TableHead>
                  <TableHead className="w-[38%] md:w-[27%]">问题 / 结果</TableHead>
                  <TableHead className="hidden md:table-cell md:w-[17%]">检查信息</TableHead>
                  <TableHead className="w-12 md:w-12" aria-label="操作" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map((result) => {
                  const issue = isProblem(result);
                  return (
                    <TableRow
                      key={result.entryKey}
                      className={
                        issue
                          ? result.status === "unavailable"
                            ? "bg-destructive/[0.035]"
                            : "bg-warning/[0.035]"
                          : undefined
                      }
                    >
                      <TableCell className="align-top">
                        <div className="flex min-w-0 items-start gap-2">
                          <ResultIcon result={result} />
                          <div className="min-w-0">
                            <div className="font-medium leading-5">{result.projectTitle}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {result.entryLabel}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {result.entryKind}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[260px] align-top md:table-cell">
                        <a
                          className="inline-flex max-w-full items-start gap-1 text-primary hover:underline"
                          href={result.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="break-all text-xs leading-5">{result.href}</span>
                          <ExternalLink className="mt-0.5 size-3 shrink-0" />
                        </a>
                        {result.finalUrl && result.finalUrl !== result.href ? (
                          <div className="mt-2 break-all text-xs leading-5 text-muted-foreground">
                            最终：{result.finalUrl}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge tone={resultTone(result)}>
                          {issue ? problemLabel(result) : "可用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div
                          className={
                            issue
                              ? "font-medium leading-5 text-foreground"
                              : "leading-5 text-muted-foreground"
                          }
                        >
                          {issue
                            ? problemDetail(result)
                            : `HTTP ${result.httpStatus ?? "-"} 返回正常。`}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {result.domain}
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap align-top text-xs leading-5 text-muted-foreground md:table-cell">
                        <div>HTTP {result.httpStatus ?? "-"}</div>
                        <div>
                          {result.attemptCount} 次尝试 ·{" "}
                          {result.latencyMs === null ? "-" : `${result.latencyMs} ms`}
                        </div>
                        <div>{result.checkedAt ? formatDateTime(result.checkedAt) : "未检查"}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          aria-label={`打开 ${result.entryLabel}`}
                          title={`打开 ${result.entryLabel}`}
                        >
                          <a href={result.href} target="_blank" rel="noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

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
