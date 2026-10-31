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
import { projectPublicEntryKindDefinitions } from "@/lib/project-catalog";
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

type ProjectStatusMatrixRow = {
  projectSlug: string;
  projectTitle: string;
  cells: Map<string, ProjectStatusResultDto[]>;
  problemCount: number;
};

function matrixRowTone(row: ProjectStatusMatrixRow) {
  if (row.problemCount === 0) return "";
  return "bg-warning/[0.025]";
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

  const matrixLinkGroups = useMemo(
    () => projectPublicEntryKindDefinitions.filter(({ id }) => kind === "all" || id === kind),
    [kind]
  );

  const matrixRows = useMemo(() => {
    const rows = new Map<string, ProjectStatusMatrixRow>();
    for (const result of filteredResults) {
      const row = rows.get(result.projectSlug) ?? {
        projectSlug: result.projectSlug,
        projectTitle: result.projectTitle,
        cells: new Map<string, ProjectStatusResultDto[]>(),
        problemCount: 0,
      };
      const cell = row.cells.get(result.entryKind) ?? [];
      cell.push(result);
      row.cells.set(result.entryKind, cell);
      if (isProblem(result)) row.problemCount += 1;
      rows.set(result.projectSlug, row);
    }
    return [...rows.values()].sort(
      (left, right) =>
        Number(right.problemCount > 0) - Number(left.problemCount > 0) ||
        right.problemCount - left.problemCount ||
        left.projectTitle.localeCompare(right.projectTitle, "zh-CN")
    );
  }, [filteredResults]);

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
        description="按链接分组展示项目状态，异常项目排在矩阵顶部。"
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
              项目状态矩阵
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {matrixRows.length > 0
                ? `行是 ${matrixRows.length} 个项目，列是 ${matrixLinkGroups.length} 个链接分组；${filteredResults.length} 个入口按项目归并，${problemResults.length} 个问题优先标记。`
                : totalProblems > 0
                  ? "当前筛选没有匹配的项目，尝试清除筛选。"
                  : "本批次尚未产生项目结果。"}
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
          <Select value={domain} onValueChange={setDomain} aria-label="筛选项目分类">
            <option value="all">全部项目分类</option>
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
          <Select value={kind} onValueChange={setKind} aria-label="筛选链接分组">
            <option value="all">全部链接分组</option>
            {projectPublicEntryKindDefinitions.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
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
        ) : matrixRows.length === 0 ? (
          <EmptyState title="没有匹配的项目" description="调整筛选条件后重试。" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/58 bg-card/72 lg:rounded-[1rem]">
            <Table className="table-fixed min-w-[980px]">
              <caption className="sr-only">项目与链接分组状态矩阵（异常项目优先）</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18%]">项目</TableHead>
                  {matrixLinkGroups.map((linkGroup) => (
                    <TableHead key={linkGroup.id} className="w-[16.4%] align-top">
                      <div className="font-semibold">{linkGroup.label}</div>
                      <div className="mt-1 font-normal text-muted-foreground">{linkGroup.id}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrixRows.map((row) => {
                  return (
                    <TableRow key={row.projectSlug} className={matrixRowTone(row)}>
                      <TableCell className="align-top">
                        <div className="min-w-0">
                          <div className="font-medium leading-5">{row.projectTitle}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.problemCount > 0
                              ? `${row.problemCount} 个问题`
                              : `${[...row.cells.values()].flat().length} 个入口可用`}
                          </div>
                        </div>
                      </TableCell>
                      {matrixLinkGroups.map((linkGroup) => {
                        const results = row.cells.get(linkGroup.id) ?? [];
                        return (
                          <TableCell key={linkGroup.id} className="align-top">
                            {results.length > 0 ? (
                              <div className="space-y-2">
                                {results.map((result) => {
                                  const issue = isProblem(result);
                                  return (
                                    <div
                                      key={result.entryKey}
                                      className={`rounded-lg border px-2.5 py-2 ${
                                        issue
                                          ? result.status === "unavailable"
                                            ? "border-destructive/30 bg-destructive/7"
                                            : "border-warning/35 bg-warning/8"
                                          : "border-border/50 bg-background/35"
                                      }`}
                                    >
                                      <div className="flex items-start gap-1.5">
                                        <ResultIcon result={result} />
                                        <div className="min-w-0 flex-1">
                                          <a
                                            className="inline-flex max-w-full items-start gap-1 text-sm font-medium leading-5 text-primary hover:underline"
                                            href={result.href}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <span className="truncate">{result.entryLabel}</span>
                                            <ExternalLink className="mt-0.5 size-3 shrink-0" />
                                          </a>
                                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            <Badge tone={resultTone(result)}>
                                              {issue ? problemLabel(result) : "可用"}
                                            </Badge>
                                            <span className="text-[11px] text-muted-foreground">
                                              {issue
                                                ? problemDetail(result)
                                                : `HTTP ${result.httpStatus ?? "-"}`}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground/45">—</span>
                            )}
                          </TableCell>
                        );
                      })}
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
