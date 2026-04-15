import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";
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

function getJobKeyFromLocation() {
  const pathname = window.location.pathname.replace(/^\/admin\/?/, "");
  return decodeURIComponent(pathname.split("/")[1] ?? "");
}

export function ScheduleDetailPage() {
  const queryClient = useQueryClient();
  const jobKey = getJobKeyFromLocation();
  const jobsQuery = useQuery({ queryKey: ["admin-jobs"], queryFn: adminApi.listJobs });
  const runsQuery = useQuery({
    queryKey: ["admin-job-runs", jobKey],
    queryFn: () => adminApi.listJobRuns({ key: jobKey, limit: 50 }),
  });
  const triggerMutation = useMutation({
    mutationFn: adminApi.triggerJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-job-runs", jobKey] });
    },
  });

  const job = (jobsQuery.data ?? []).find((item) => item.key === jobKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title={job?.name ?? "任务详情"}
        description={jobKey}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/admin/schedules">返回列表</a>
            </Button>
            <Button
              onClick={() => triggerMutation.mutate(jobKey)}
              disabled={triggerMutation.isPending}
            >
              {triggerMutation.isPending ? <Spinner /> : <PlayCircle className="size-4" />}
              手动触发
            </Button>
          </>
        }
      />

      {jobsQuery.error ? <Alert tone="danger">{getErrorMessage(jobsQuery.error)}</Alert> : null}
      {runsQuery.error ? <Alert tone="danger">{getErrorMessage(runsQuery.error)}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>任务概况</CardTitle>
          <CardDescription>当前调度配置与下一次执行时间。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <div className="text-sm text-muted-foreground">运行状态</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={job?.running ? "warning" : "outline"}>
                {job?.running ? "running" : "idle"}
              </Badge>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <div className="text-sm text-muted-foreground">调度</div>
            <div className="mt-2 font-medium">{job?.scheduleText || "手动触发"}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              下次运行：{formatDateTime(job?.nextRunAt)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>执行记录</CardTitle>
          <CardDescription>按时间倒序展示最近 50 次运行。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>状态</TableHead>
                <TableHead>触发方式</TableHead>
                <TableHead>开始时间</TableHead>
                <TableHead>结束时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runsQuery.data ?? []).map((run) => (
                <TableRow key={run.id}>
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
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(run.finishedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/admin/schedules/runs/${encodeURIComponent(run.id)}`}>查看日志</a>
                      </Button>
                    </div>
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
