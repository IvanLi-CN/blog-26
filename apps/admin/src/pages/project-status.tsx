import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  RefreshCcw,
  Timer,
  XCircle,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import { projectDomains, projectPublicEntryKindDefinitions } from "@/lib/project-catalog";
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

function ResultIcon({
  result,
  className = "size-4",
  historical = false,
}: {
  result: ProjectStatusResultDto;
  className?: string;
  historical?: boolean;
}) {
  if (result.status === "available" && (historical || result.freshness === "fresh")) {
    return <CheckCircle2 className={`${className} text-success`} aria-hidden />;
  }
  if (result.status === "unavailable") {
    return <XCircle className={`${className} text-destructive`} aria-hidden />;
  }
  return <AlertTriangle className={`${className} text-warning`} aria-hidden />;
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

function problemDetail(result: ProjectStatusResultDto) {
  if (result.status === "unknown") return "尚未完成成功检查，暂时不能确认入口状态。";
  if (result.errorMessage) return result.errorMessage;
  if (result.freshness === "stale") return "最近一次结果超过 12 小时未更新。";
  return `HTTP ${result.httpStatus ?? "-"} 返回异常。`;
}

function problemStatusLabel(result: ProjectStatusResultDto) {
  if (result.status === "unavailable") return "异常";
  if (result.status === "unknown") return "未知";
  return "陈旧";
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

function MatrixCellSummary({ results }: { results: ProjectStatusResultDto[] }) {
  if (results.length === 0) {
    return <span className="text-muted-foreground/45">—</span>;
  }

  const problemCount = results.filter(isProblem).length;
  const availableCount = results.length - problemCount;
  const statusResult = results.find(isProblem) ?? results[0];
  const label =
    problemCount > 0
      ? `${problemCount} 个问题，${availableCount} 个可用`
      : `${availableCount} 个可用`;

  return (
    <span
      role="img"
      className={`inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums ${
        problemCount > 0 ? "text-destructive" : "text-success"
      }`}
      aria-label={label}
    >
      <ResultIcon result={statusResult} className="size-3.5" />
      <span>{problemCount > 0 ? `${problemCount}/${results.length}` : results.length}</span>
    </span>
  );
}

export function ProjectStatusPage() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("all");
  const [project, setProject] = useState("all");
  const [kind, setKind] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedHistoryRuns, setExpandedHistoryRuns] = useState<Set<string>>(new Set());
  const [manualCheckQueuedAt, setManualCheckQueuedAt] = useState<number | null>(null);
  const overviewQuery = useQuery({
    queryKey: ["admin-project-status-overview"],
    queryFn: adminApi.getProjectStatusOverview,
    refetchInterval: (current) =>
      current.state.data?.activeRun || manualCheckQueuedAt !== null ? 2000 : false,
  });
  const historyQuery = useQuery({
    queryKey: ["admin-project-status-history"],
    queryFn: () => adminApi.getProjectStatusHistory(),
  });
  useEffect(() => {
    if (manualCheckQueuedAt === null) return;
    const latestRun = overviewQuery.data?.latestRun;
    if (overviewQuery.data?.activeRun) return;
    if (latestRun && latestRun.startedAt >= manualCheckQueuedAt) {
      setManualCheckQueuedAt(null);
      return;
    }
    const timeout = window.setTimeout(() => setManualCheckQueuedAt(null), 10 * 60 * 1000);
    return () => window.clearTimeout(timeout);
  }, [manualCheckQueuedAt, overviewQuery.data]);
  useEffect(() => {
    if (!overviewQuery.data?.activeRun) {
      queryClient.invalidateQueries({ queryKey: ["admin-project-status-history"] });
    }
  }, [overviewQuery.data?.activeRun, queryClient]);
  const triggerMutation = useMutation({
    mutationFn: adminApi.triggerProjectStatusCheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-project-status-overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin-project-status-history"] });
    },
    onError: () => {
      setManualCheckQueuedAt(null);
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
      .filter((result) => {
        if (filter === "all") return true;
        if (filter === "available")
          return result.status === "available" && result.freshness !== "stale";
        if (filter === "stale") return result.freshness === "stale";
        return result.status === filter;
      })
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
    () =>
      [...new Map((overview?.catalog ?? []).map((entry) => [entry.domain, entry.domain]))].map(
        ([value]) =>
          [
            value,
            projectDomains.find((domainDefinition) => domainDefinition.id === value)?.title ??
              value,
          ] as const
      ),
    [overview?.catalog]
  );
  const problemResults = filteredResults.filter(isProblem);
  const totalProblems = (overview?.results ?? []).filter(isProblem).length;
  const hasActiveFilters =
    domain !== "all" ||
    project !== "all" ||
    kind !== "all" ||
    filter !== "all" ||
    query.trim() !== "";

  const toggleProject = (projectSlug: string) => {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectSlug)) {
        next.delete(projectSlug);
      } else {
        next.add(projectSlug);
      }
      return next;
    });
  };

  const toggleHistoryRun = (runId: string) => {
    setExpandedHistoryRuns((current) => {
      const next = new Set(current);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目状态"
        description="按链接分组一览项目状态；展开项目行查看具体入口。"
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
              onClick={() => {
                setManualCheckQueuedAt(Date.now());
                triggerMutation.mutate();
              }}
              disabled={
                Boolean(overview?.activeRun) ||
                triggerMutation.isPending ||
                manualCheckQueuedAt !== null
              }
            >
              {triggerMutation.isPending || overview?.activeRun || manualCheckQueuedAt !== null ? (
                <Spinner />
              ) : (
                <Timer className="size-4" />
              )}
              {overview?.activeRun || manualCheckQueuedAt !== null ? "检查中" : "手动检查"}
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
      {overview?.activeRun || manualCheckQueuedAt !== null ? (
        <Alert tone="warning">
          {overview?.activeRun
            ? `批次正在运行：已处理 ${overview.activeRun.attemptedCount} / ${overview.activeRun.targetCount} 个入口，页面会自动刷新。`
            : "检查已排队，等待任务写入批次；页面会自动刷新。"}
        </Alert>
      ) : null}

      <section className="rounded-3xl border border-destructive/24 bg-destructive/6 p-5 shadow-lg shadow-shadow-soft lg:rounded-[1.25rem] lg:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.6fr)] lg:items-center">
          <div>
            <div className="text-sm font-medium text-muted-foreground">当前需要处理</div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="text-5xl font-semibold tabular-nums text-destructive">
                {overview ? totalProblems : "—"}
              </div>
              <div className="text-sm text-muted-foreground">
                / {overview ? overview.summary.total : "—"} 个入口
              </div>
            </div>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {!overview
                ? overviewQuery.isPending
                  ? "正在加载当前入口状态。"
                  : "无法读取当前入口状态，请重试。"
                : totalProblems > 0
                  ? "红色异常优先处理；未知和陈旧需要确认检查是否完整。"
                  : "当前没有需要处理的入口。"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["unavailable", "异常", overview?.summary.unavailable ?? 0, "danger"],
              ["unknown", "未知", overview?.summary.unknown ?? 0, "warning"],
              ["stale", "陈旧", overview?.summary.stale ?? 0, "warning"],
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
                  {overview ? count : "—"}
                </span>
                <span className="text-sm">{label}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-destructive/15 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden />
            {overview ? overview.summary.available : "—"} 个可用
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden />
            {overview?.latestRun
              ? `最近批次 ${formatDateTime(overview.latestRun.finishedAt ?? overview.latestRun.startedAt)}`
              : overview
                ? "尚未完成检查"
                : "当前状态不可用"}
          </span>
        </div>
      </section>

      <section aria-labelledby="project-status-problems" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="project-status-problems" className="text-xl font-semibold">
              问题列表
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {!overview
                ? overviewQuery.isPending
                  ? "正在加载问题列表。"
                  : "无法读取当前问题列表。"
                : problemResults.length > 0
                  ? `当前筛选发现 ${problemResults.length} 个需要处理的入口。`
                  : "当前筛选没有需要处理的入口。"}
            </p>
          </div>
          {problemResults.length > 0 ? (
            <Badge tone="danger">{problemResults.length} 个问题</Badge>
          ) : null}
        </div>
        {problemResults.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-destructive/20 bg-card/72 lg:rounded-[1rem]">
            <Table className="min-w-[780px] text-[13px]">
              <caption className="sr-only">项目入口问题列表</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-10 py-2 normal-case tracking-normal">项目</TableHead>
                  <TableHead className="h-10 py-2 normal-case tracking-normal">链接分组</TableHead>
                  <TableHead className="h-10 py-2 normal-case tracking-normal">入口</TableHead>
                  <TableHead className="h-10 py-2 normal-case tracking-normal">问题</TableHead>
                  <TableHead className="h-10 py-2 normal-case tracking-normal">检查时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problemResults.map((result) => {
                  const linkGroup = projectPublicEntryKindDefinitions.find(
                    (definition) => definition.id === result.entryKind
                  );
                  return (
                    <TableRow key={result.entryKey} className="bg-destructive/[0.025]">
                      <TableCell className="py-2 font-medium">{result.projectTitle}</TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {linkGroup?.label ?? result.entryKind}
                      </TableCell>
                      <TableCell className="max-w-[18rem] py-2">
                        <a
                          className="inline-flex max-w-full items-center gap-1 truncate font-medium text-primary hover:underline"
                          href={result.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="truncate">{result.entryLabel}</span>
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                        </a>
                      </TableCell>
                      <TableCell className="max-w-[24rem] py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge
                            tone={result.status === "unavailable" ? "danger" : "warning"}
                            className="shrink-0 whitespace-nowrap"
                          >
                            {problemStatusLabel(result)}
                          </Badge>
                          <span
                            className="truncate text-muted-foreground"
                            title={problemDetail(result)}
                          >
                            {problemDetail(result)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-muted-foreground">
                        {result.checkedAt ? formatDateTime(result.checkedAt) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/52 bg-card/54 px-4 py-3 text-sm text-muted-foreground">
            {overview
              ? !overview.latestRun
                ? "本批次尚未产生检查结果。"
                : totalProblems > 0 && hasActiveFilters
                  ? "当前筛选没有匹配的问题。"
                  : "没有异常入口，当前检查结果正常。"
              : overviewQuery.isPending
                ? "正在加载检查结果。"
                : "当前状态不可用，请重试。"}
          </div>
        )}
      </section>

      <section aria-labelledby="project-status-results" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="project-status-results" className="text-xl font-semibold">
              项目状态一览表
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {!overview
                ? overviewQuery.isPending
                  ? "正在加载项目状态。"
                  : "无法读取项目状态。"
                : matrixRows.length > 0
                  ? `行是 ${matrixRows.length} 个项目，列是 ${matrixLinkGroups.length} 个链接分组；${filteredResults.length} 个入口已压缩为状态摘要，${problemResults.length} 个问题优先标记。`
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>状态图例</span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden />
            可用
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="size-3.5 text-destructive" aria-hidden />
            异常
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-warning" aria-hidden />
            未知 / 陈旧
          </span>
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
            {domainOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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
            <option value="stale">陈旧</option>
            <option value="available">可用</option>
          </Select>
        </div>

        {overviewQuery.isError && !overview ? (
          <EmptyState title="无法加载项目状态" description="请刷新后重试。" />
        ) : overviewQuery.isPending ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border/52 bg-card/54">
            <Spinner className="size-6" />
          </div>
        ) : matrixRows.length === 0 ? (
          <EmptyState title="没有匹配的项目" description="调整筛选条件后重试。" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/58 bg-card/72 lg:rounded-[1rem]">
            <Table className="table-fixed min-w-[760px] text-[13px]">
              <caption className="sr-only">项目与链接分组状态一览表（异常项目优先）</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-10 w-[24%] py-2 normal-case tracking-normal">
                    项目
                  </TableHead>
                  {matrixLinkGroups.map((linkGroup) => (
                    <TableHead
                      key={linkGroup.id}
                      className="h-10 w-[15.2%] py-2 normal-case tracking-normal"
                    >
                      {linkGroup.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrixRows.map((row) => {
                  const expanded = expandedProjects.has(row.projectSlug);
                  const rowResults = [...row.cells.values()].flat();
                  return (
                    <Fragment key={row.projectSlug}>
                      <TableRow className={matrixRowTone(row)}>
                        <TableCell className="py-2 align-middle">
                          <div className="flex min-w-0 items-center gap-2">
                            <Button
                              variant="bare"
                              size="icon"
                              className="shrink-0"
                              aria-label={`${expanded ? "收起" : "展开"} ${row.projectTitle} 入口详情`}
                              aria-expanded={expanded}
                              onClick={() => toggleProject(row.projectSlug)}
                            >
                              <ChevronDown
                                className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                                aria-hidden
                              />
                            </Button>
                            <div className="min-w-0">
                              <div className="truncate font-medium leading-5">
                                {row.projectTitle}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {row.problemCount > 0
                                  ? `${row.problemCount} 个问题`
                                  : `${rowResults.length} 个入口可用`}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        {matrixLinkGroups.map((linkGroup) => {
                          const results = row.cells.get(linkGroup.id) ?? [];
                          return (
                            <TableCell key={linkGroup.id} className="py-2 align-middle">
                              <MatrixCellSummary results={results} />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {expanded ? (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={matrixLinkGroups.length + 1} className="px-4 py-3">
                            <div className="grid gap-x-6 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
                              {matrixLinkGroups.flatMap((linkGroup) =>
                                (row.cells.get(linkGroup.id) ?? []).map((result) => {
                                  const issue = isProblem(result);
                                  return (
                                    <div
                                      key={result.entryKey}
                                      className="flex min-w-0 items-center gap-2 border-b border-border/35 pb-2 last:border-b-0"
                                      title={issue ? problemDetail(result) : undefined}
                                    >
                                      <span className="w-16 shrink-0 truncate text-xs font-medium text-muted-foreground">
                                        {linkGroup.label}
                                      </span>
                                      <ResultIcon result={result} className="size-3.5 shrink-0" />
                                      <a
                                        className="min-w-0 truncate text-xs font-medium text-primary hover:underline"
                                        href={result.href}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {result.entryLabel}
                                        <ExternalLink className="ml-1 inline size-3" aria-hidden />
                                      </a>
                                      <span
                                        className={`ml-auto min-w-0 max-w-[18rem] truncate text-[11px] ${
                                          issue ? "text-destructive" : "text-muted-foreground"
                                        }`}
                                      >
                                        {issue
                                          ? problemDetail(result)
                                          : `HTTP ${result.httpStatus ?? "-"}`}
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
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
          {historyQuery.isPending ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              正在加载检查历史…
            </div>
          ) : historyQuery.data?.runs.length === 0 ? (
            <EmptyState
              title="暂无检查历史"
              description="完成一次项目状态检查后，批次会显示在这里。"
            />
          ) : (
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
                    <TableHead>说明</TableHead>
                    <TableHead>入口快照</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(historyQuery.data?.runs ?? []).map((run) => {
                    const expanded = expandedHistoryRuns.has(run.id);
                    return (
                      <Fragment key={run.id}>
                        <TableRow>
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
                          <TableCell
                            className="max-w-52 truncate text-muted-foreground"
                            title={run.errorMessage ?? undefined}
                          >
                            {run.errorMessage ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="bare"
                              size="sm"
                              className="gap-1 px-1"
                              aria-expanded={expanded}
                              onClick={() => toggleHistoryRun(run.id)}
                            >
                              <ChevronDown
                                className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                                aria-hidden
                              />
                              {expanded ? "收起" : `${run.results.length} 个入口`}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/20 p-3">
                              <div className="grid gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50 sm:grid-cols-2 lg:grid-cols-3">
                                {run.results.map((result) => (
                                  <a
                                    key={result.entryKey}
                                    href={result.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex min-w-0 items-center gap-2 bg-card/90 px-2.5 py-2 text-xs hover:bg-card"
                                  >
                                    <ResultIcon
                                      result={result}
                                      historical
                                      className="size-3.5 shrink-0"
                                    />
                                    <span className="min-w-0 truncate" title={result.href}>
                                      {result.projectTitle} · {result.entryLabel}
                                    </span>
                                    <span className="ml-auto shrink-0 text-muted-foreground">
                                      {result.status === "available"
                                        ? "可用"
                                        : result.status === "unavailable"
                                          ? "异常"
                                          : result.freshness === "stale"
                                            ? "陈旧"
                                            : "未知"}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
