import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Database, Filter, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type AdminAiUsageOverview,
  type AdminUsageGroupBy,
  type AdminUsageRange,
  type AdminUsageStatus,
  adminApi,
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
  EmptyState,
  FieldLabel,
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
import { formatCount, formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

const rangeOptions: Array<{ value: AdminUsageRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "最近七日（含今天）" },
  { value: "30d", label: "最近三十日" },
  { value: "90d", label: "最近九十日" },
  { value: "365d", label: "最近一年" },
  { value: "custom", label: "自定义范围" },
];

const statusOptions: Array<{ value: AdminUsageStatus | "all"; label: string }> = [
  { value: "all", label: "全部结果" },
  { value: "success", label: "成功" },
  { value: "failure", label: "失败" },
  { value: "cancelled", label: "中止" },
  { value: "missing", label: "缺失" },
  { value: "incomplete", label: "不完整" },
];

const metricToneClasses = {
  primary: "bg-primary/14 text-primary",
  secondary: "bg-secondary/14 text-secondary",
  warning: "bg-warning/14 text-warning",
  success: "bg-success/14 text-success",
} as const;

function metricValue(value: number) {
  return formatCount(value);
}

function MetricCard({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  tone: "primary" | "secondary" | "warning" | "success";
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
        <div
          className={`flex size-11 items-center justify-center rounded-2xl ${metricToneClasses[tone]}`}
        >
          <BarChart3 className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function TrendChart({ data }: { data: AdminAiUsageOverview["trend"] }) {
  const max = Math.max(
    1,
    ...data.map(
      (item) =>
        item.inputTokens - item.cachedInputTokens + item.cachedInputTokens + item.outputTokens
    )
  );
  const bandWidth = data.length > 20 ? 28 : Math.max(30, (760 - 60) / Math.max(1, data.length));
  const width = Math.max(760, 60 + data.length * bandWidth);
  const chartHeight = 220;
  const barWidth = Math.max(10, Math.min(22, bandWidth - 8));
  const labelStride = data.length > 60 ? Math.ceil(data.length / 12) : data.length > 20 ? 3 : 1;
  return (
    <div className="space-y-4">
      <svg
        className="h-56"
        style={{ width: `${width}px`, minWidth: "620px" }}
        viewBox={`0 0 ${width} ${chartHeight}`}
        role="img"
        aria-labelledby="usage-trend-title usage-trend-description"
      >
        <title id="usage-trend-title">每日 AI Token 消耗趋势</title>
        <desc id="usage-trend-description">
          未缓存输入、缓存输入和输出按天堆叠，数值以旁边的表格为准。
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
              {index % labelStride === 0 || index === data.length - 1 ? (
                <text
                  x={x + barWidth / 2}
                  y="210"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {item.day.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-primary/70" />
          未缓存输入
        </span>
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-secondary/75" />
          缓存输入
        </span>
        <span>
          <i className="mr-1 inline-block size-2 rounded-sm bg-warning/80" />
          输出
        </span>
      </div>
      <div className="overflow-x-auto admin-scrollbar">
        <Table aria-label="每日 AI 用量同值表格">
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead>未缓存输入</TableHead>
              <TableHead>缓存输入</TableHead>
              <TableHead>输出</TableHead>
              <TableHead>调用</TableHead>
              <TableHead>缺失/估算</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.day}>
                <TableCell>{item.day}</TableCell>
                <TableCell>
                  {metricValue(Math.max(0, item.inputTokens - item.cachedInputTokens))}
                </TableCell>
                <TableCell>{metricValue(item.cachedInputTokens)}</TableCell>
                <TableCell>{metricValue(item.outputTokens)}</TableCell>
                <TableCell>{metricValue(item.callCount)}</TableCell>
                <TableCell>
                  {metricValue(item.missingCallCount)} / {metricValue(item.estimatedCallCount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UsageOverview({ data }: { data: AdminAiUsageOverview }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="总 Token"
          value={metricValue(data.metric.totalTokens)}
          description={`输入 ${metricValue(data.metric.inputTokens)} · 输出 ${metricValue(data.metric.outputTokens)} · 推理 ${metricValue(data.metric.reasoningTokens)}`}
          tone="primary"
        />
        <MetricCard
          title="调用次数"
          value={metricValue(data.metric.callCount)}
          description={`成功 ${metricValue(data.metric.successCallCount)} · 失败 ${metricValue(data.metric.failureCallCount)} · 中止 ${metricValue(data.metric.cancelledCallCount)}`}
          tone="secondary"
        />
        <MetricCard
          title="缓存输入"
          value={metricValue(data.metric.cachedInputTokens)}
          description="已包含在输入维度中，图表单独标识"
          tone="success"
        />
        <MetricCard
          title="估算/缺失"
          value={`${metricValue(data.metric.estimatedCallCount)} / ${metricValue(data.metric.missingCallCount)}`}
          description="估算与不完整调用不会伪装成精确零值"
          tone="warning"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>每日趋势</CardTitle>
          <CardDescription>
            时区：{data.timezone} · 输入堆叠已扣除缓存命中，避免重复累计。
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          <TrendChart data={data.trend} />
        </CardContent>
      </Card>
    </>
  );
}

function UsageFilters({
  data,
  range,
  setRange,
  from,
  setFrom,
  to,
  setTo,
  groupBy,
  setGroupBy,
  user,
  setUser,
  feature,
  setFeature,
  model,
  setModel,
  status,
  setStatus,
}: {
  data: AdminAiUsageOverview | undefined;
  range: AdminUsageRange;
  setRange: (value: AdminUsageRange) => void;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
  groupBy: AdminUsageGroupBy;
  setGroupBy: (value: AdminUsageGroupBy) => void;
  user: string;
  setUser: (value: string) => void;
  feature: string;
  setFeature: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  status: AdminUsageStatus | "all";
  setStatus: (value: AdminUsageStatus | "all") => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="size-4 text-primary" />
          筛选与分组
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <FieldLabel>时间范围</FieldLabel>
          <Select
            aria-label="时间范围"
            value={range}
            onValueChange={(value) => setRange(value as AdminUsageRange)}
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel>分组方式</FieldLabel>
          <Select
            aria-label="分组方式"
            value={groupBy}
            onValueChange={(value) => setGroupBy(value as AdminUsageGroupBy)}
          >
            <option value="feature">按功能</option>
            <option value="user">按用户</option>
            <option value="model">按模型</option>
          </Select>
        </div>
        <div>
          <FieldLabel>用户</FieldLabel>
          <Select
            aria-label="用户"
            value={user || "all"}
            onValueChange={(value) => setUser(value === "all" ? "" : value)}
          >
            <option value="all">全部用户</option>
            {(data?.facets.users ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel>结果</FieldLabel>
          <Select
            aria-label="结果"
            value={status}
            onValueChange={(value) => setStatus(value as AdminUsageStatus | "all")}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel>功能</FieldLabel>
          <Select
            aria-label="功能"
            value={feature || "all"}
            onValueChange={(value) => setFeature(value === "all" ? "" : value)}
          >
            <option value="all">全部功能</option>
            {(data?.facets.features ?? []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel>模型</FieldLabel>
          <Select
            aria-label="模型"
            value={model || "all"}
            onValueChange={(value) => setModel(value === "all" ? "" : value)}
          >
            <option value="all">全部模型</option>
            {(data?.facets.models ?? []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
        {range === "custom" ? (
          <>
            <div>
              <FieldLabel>开始日期</FieldLabel>
              <Input
                aria-label="开始日期"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div>
              <FieldLabel>结束日期</FieldLabel>
              <Input
                aria-label="结束日期"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UsageTables({ data }: { data: AdminAiUsageOverview }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>分组汇总</CardTitle>
          <CardDescription>按当前分组方式聚合原始调用与每日汇总。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          <Table aria-label="AI 用量分组汇总">
            <TableHeader>
              <TableRow>
                <TableHead>维度</TableHead>
                <TableHead>调用</TableHead>
                <TableHead>输入</TableHead>
                <TableHead>输出</TableHead>
                <TableHead>结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.groups.map((group) => (
                <TableRow key={group.key}>
                  <TableCell className="font-medium">{group.label}</TableCell>
                  <TableCell>{metricValue(group.callCount)}</TableCell>
                  <TableCell>{metricValue(group.inputTokens)}</TableCell>
                  <TableCell>{metricValue(group.outputTokens)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      成功 {metricValue(group.successCallCount)} · 缺失{" "}
                      {metricValue(group.missingCallCount)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>调用明细</CardTitle>
          <CardDescription>
            {data.retention.rangeCoverage === "summary"
              ? "当前范围仅有每日汇总，90 天外不提供逐调用明细。"
              : `明细保留 ${data.retention.detailRetentionDays} 天，最早可查 ${data.retention.detailAvailableFrom}。`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          <Table aria-label="AI 调用明细">
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>功能 / 模型</TableHead>
                <TableHead>提供方</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>输入 / 缓存 / 输出</TableHead>
                <TableHead>推理 / 总 Token</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.details.map((detail) => (
                <TableRow key={detail.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(detail.occurredAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {detail.frontendUserId ?? "未归属用户"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{detail.feature}</div>
                    <div className="text-xs text-muted-foreground">
                      {detail.model ?? "未归属模型"}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {detail.provider ?? "未记录"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        tone={
                          detail.status === "success"
                            ? "success"
                            : detail.status === "failure"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {detail.status}
                      </Badge>
                      {detail.estimated ? <Badge tone="outline">估算</Badge> : null}
                      {!detail.usageComplete ? <Badge tone="warning">用量不完整</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {detail.inputTokens === null ? "未知" : metricValue(detail.inputTokens)} /{" "}
                    {detail.cachedInputTokens === null
                      ? "未知"
                      : metricValue(detail.cachedInputTokens)}{" "}
                    / {detail.outputTokens === null ? "未知" : metricValue(detail.outputTokens)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {detail.reasoningTokens === null ? "未知" : metricValue(detail.reasoningTokens)}{" "}
                    / {detail.totalTokens === null ? "未知" : metricValue(detail.totalTokens)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.detailsTruncated ? (
            <Alert tone="warning" className="mt-4">
              当前范围共有 {metricValue(data.detailTotal)} 条逐调用明细，页面展示前 500
              条；请缩小时间范围或继续使用分组汇总。
            </Alert>
          ) : null}
          {data.details.length === 0 ? (
            <EmptyDetails coverage={data.retention.rangeCoverage} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyDetails({
  coverage,
}: {
  coverage: AdminAiUsageOverview["retention"]["rangeCoverage"];
}) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      {coverage === "summary" ? "当前范围已超过逐调用明细保留期。" : "当前筛选没有调用明细。"}
    </div>
  );
}

function dateInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function AiUsagePage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<AdminUsageRange>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupBy, setGroupBy] = useState<AdminUsageGroupBy>("feature");
  const [user, setUser] = useState("");
  const [feature, setFeature] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<AdminUsageStatus | "all">("all");
  const [notice, setNotice] = useState<string | null>(null);
  const usageQuery = useQuery({
    queryKey: ["admin-ai-usage", range, from, to, groupBy, user, feature, model, status],
    queryFn: () =>
      adminApi.getAiUsage({
        range,
        from: range === "custom" ? from : undefined,
        to: range === "custom" ? to : undefined,
        groupBy,
        user: user || undefined,
        feature: feature || undefined,
        model: model || undefined,
        status: status === "all" ? undefined : status,
      }),
  });
  const policyQuery = useQuery({
    queryKey: ["admin-ai-usage-policy"],
    queryFn: adminApi.getAiUsagePolicy,
  });
  const policy = policyQuery.data;
  const [policyForm, setPolicyForm] = useState({
    tokenHourlyLimit: 0,
    tokenWeeklyLimit: 0,
    questionHourlyLimit: 0,
    questionWeeklyLimit: 0,
    maxConversations: 0,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    timezone: "Asia/Shanghai",
  });
  useEffect(() => {
    if (!policy) return;
    setPolicyForm({
      tokenHourlyLimit: policy.tokenHourlyLimit,
      tokenWeeklyLimit: policy.tokenWeeklyLimit,
      questionHourlyLimit: policy.questionHourlyLimit,
      questionWeeklyLimit: policy.questionWeeklyLimit,
      maxConversations: policy.maxConversations,
      retentionMs: policy.retentionMs,
      timezone: policy.timezone,
    });
  }, [policy]);
  const policyMutation = useMutation({
    mutationFn: () => adminApi.updateAiUsagePolicy(policyForm),
    onSuccess: () => {
      setNotice("全局配额策略已保存；既有用量和用户恢复记录保持不变。");
      void queryClient.invalidateQueries({ queryKey: ["admin-ai-usage-policy"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const usage = usageQuery.data;
  const selectRange = (nextRange: AdminUsageRange) => {
    if (nextRange === "custom" && (!from || !to)) {
      const today = dateInTimezone(new Date(), policy?.timezone ?? "Asia/Shanghai");
      const weekAgo = dateInTimezone(
        new Date(Date.now() - 6 * 24 * 60 * 60 * 1_000),
        policy?.timezone ?? "Asia/Shanghai"
      );
      setFrom(from || weekAgo);
      setTo(to || today);
    }
    setRange(nextRange);
  };
  const policyFields = useMemo(
    () => [
      { key: "tokenHourlyLimit" as const, label: "Token / 小时" },
      { key: "tokenWeeklyLimit" as const, label: "Token / 七日" },
      { key: "questionHourlyLimit" as const, label: "问答 / 小时" },
      { key: "questionWeeklyLimit" as const, label: "问答 / 七日" },
      { key: "maxConversations" as const, label: "最大对话数" },
    ],
    []
  );

  return (
    <div className="space-y-6" data-testid="admin-ai-usage-page">
      <PageHeader
        title="AI 用量运营"
        description="查看全站 AI 调用的趋势、分组、明细和全局个人助手额度策略。"
        actions={
          <Badge tone="outline">
            <Database className="size-3" />
            数据时区：{usage?.timezone ?? policy?.timezone ?? "Asia/Shanghai"}
          </Badge>
        }
      />
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {usageQuery.error ? (
        <Alert tone="danger">加载 AI 用量失败：{getErrorMessage(usageQuery.error)}</Alert>
      ) : null}
      {policyMutation.error ? (
        <Alert tone="danger">保存策略失败：{getErrorMessage(policyMutation.error)}</Alert>
      ) : null}
      {policyQuery.error ? (
        <Alert tone="danger">读取全局策略失败：{getErrorMessage(policyQuery.error)}</Alert>
      ) : null}
      <UsageFilters
        data={usage}
        range={range}
        setRange={selectRange}
        from={from}
        setFrom={setFrom}
        to={to}
        setTo={setTo}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        user={user}
        setUser={setUser}
        feature={feature}
        setFeature={setFeature}
        model={model}
        setModel={setModel}
        status={status}
        setStatus={setStatus}
      />
      {usageQuery.isLoading ? (
        <EmptyState title="正在整理 AI 用量" action={<Spinner className="size-6" />} />
      ) : null}
      {usage ? (
        <>
          {usage.retention.resultFilterCoverage === "summary" ? (
            <Alert tone="warning">
              当前结果筛选只适用于 90 天内的逐调用明细；更早日期只有每日汇总，无法按成功、失败或缺失
              精确拆分。
            </Alert>
          ) : null}
          <UsageOverview data={usage} />
          <UsageTables data={usage} />
        </>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            全局个人助手额度
          </CardTitle>
          <CardDescription>
            策略只影响后续个人助手请求；单用户恢复也只建立新周期，不会清除历史。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {policyFields.map((field) => (
            <div key={field.key}>
              <FieldLabel>{field.label}</FieldLabel>
              <Input
                aria-label={field.label}
                type="number"
                min="0"
                value={policyForm[field.key]}
                disabled={!policy || Boolean(policyQuery.error) || policyMutation.isPending}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    [field.key]: Number(event.target.value),
                  }))
                }
              />
            </div>
          ))}
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => policyMutation.mutate()}
              disabled={
                policyMutation.isPending ||
                policyQuery.isLoading ||
                !policy ||
                Boolean(policyQuery.error)
              }
            >
              {policyMutation.isPending ? <Spinner /> : null}保存全局策略
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
