import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, PlayCircle, RefreshCcw } from "lucide-react";
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
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

export function SchedulesPage() {
  const queryClient = useQueryClient();
  const jobsQuery = useQuery({ queryKey: ["admin-jobs"], queryFn: adminApi.listJobs });
  const runsQuery = useQuery({
    queryKey: ["admin-job-runs-recent"],
    queryFn: () => adminApi.listJobRuns({ limit: 12 }),
  });

  const triggerMutation = useMutation({
    mutationFn: adminApi.triggerJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-job-runs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-job-runs-recent"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="计划任务"
        description="监控后台任务的运行状态，必要时手动触发。"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              jobsQuery.refetch();
              runsQuery.refetch();
            }}
          >
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        }
      />

      {jobsQuery.error ? <Alert tone="danger">{getErrorMessage(jobsQuery.error)}</Alert> : null}
      {runsQuery.error ? <Alert tone="danger">{getErrorMessage(runsQuery.error)}</Alert> : null}
      {triggerMutation.error ? (
        <Alert tone="danger">{getErrorMessage(triggerMutation.error)}</Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(jobsQuery.data ?? []).map((job) => (
          <Card key={job.key}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{job.name}</CardTitle>
                  <CardDescription>{job.key}</CardDescription>
                </div>
                <Badge tone={job.running ? "warning" : "outline"}>
                  {job.running ? "running" : "idle"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="size-4" />
                {job.scheduleText || "手动触发"}
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>上次运行：{formatDateTime(job.lastRunAt)}</div>
                <div>下次运行：{formatDateTime(job.nextRunAt)}</div>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`/admin/schedules/${encodeURIComponent(job.key)}`}>查看详情</a>
                </Button>
                <Button
                  size="sm"
                  onClick={() => triggerMutation.mutate(job.key)}
                  disabled={triggerMutation.isPending}
                >
                  {triggerMutation.isPending ? <Spinner /> : <PlayCircle className="size-4" />}
                  触发
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近运行记录</CardTitle>
          <CardDescription>帮助你快速定位失败或长时间运行中的任务。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>触发方式</TableHead>
                <TableHead>开始时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                      <Spinner /> 读取中…
                    </div>
                  </TableCell>
                </TableRow>
              ) : (runsQuery.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    暂无运行记录。
                  </TableCell>
                </TableRow>
              ) : (
                (runsQuery.data ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="font-medium">{run.jobName}</div>
                      <div className="text-xs text-muted-foreground">{run.jobKey}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={
                          run.status === "success"
                            ? "success"
                            : run.status === "error"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.triggeredBy}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(run.startedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="ghost">
                          <a href={`/admin/schedules/runs/${encodeURIComponent(run.id)}`}>日志</a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
