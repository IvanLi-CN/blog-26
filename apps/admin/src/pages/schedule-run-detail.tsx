import { useQuery } from "@tanstack/react-query";
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
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

function getRunIdFromLocation() {
  const pathname = window.location.pathname.replace(/^\/admin\/?/, "");
  return decodeURIComponent(pathname.split("/")[2] ?? "");
}

export function ScheduleRunDetailPage() {
  const runId = getRunIdFromLocation();
  const runQuery = useQuery({
    queryKey: ["admin-job-run", runId],
    queryFn: () => adminApi.getJobRun(runId),
  });
  const logQuery = useQuery({
    queryKey: ["admin-job-run-log", runId],
    queryFn: () => adminApi.getJobRunLog(runId),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="运行日志"
        description={runId}
        actions={
          <Button asChild variant="outline">
            <a href="/admin/schedules">返回任务列表</a>
          </Button>
        }
      />

      {runQuery.error ? <Alert tone="danger">{getErrorMessage(runQuery.error)}</Alert> : null}
      {logQuery.error ? <Alert tone="danger">{getErrorMessage(logQuery.error)}</Alert> : null}

      {runQuery.data ? (
        <Card>
          <CardHeader>
            <CardTitle>{runQuery.data.jobName}</CardTitle>
            <CardDescription>{runQuery.data.jobKey}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <div className="text-sm text-muted-foreground">状态</div>
              <div className="mt-2">
                <Badge
                  tone={
                    runQuery.data.status === "success"
                      ? "success"
                      : runQuery.data.status === "error"
                        ? "danger"
                        : "warning"
                  }
                >
                  {runQuery.data.status}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <div className="text-sm text-muted-foreground">开始</div>
              <div className="mt-2 font-medium">{formatDateTime(runQuery.data.startedAt)}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <div className="text-sm text-muted-foreground">结束</div>
              <div className="mt-2 font-medium">{formatDateTime(runQuery.data.finishedAt)}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>日志内容</CardTitle>
          <CardDescription>来自 job logger 的原始输出。</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock>
            {logQuery.data?.exists ? logQuery.data.content : "日志文件不存在或已清理。"}
          </CodeBlock>
        </CardContent>
      </Card>
    </div>
  );
}
