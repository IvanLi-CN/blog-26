import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, RefreshCcw, Unlink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type AdminGithubBindingResponse, adminApi } from "@/lib/admin-api-client";
import { toPublicApiUrl } from "@/lib/public-runtime-url";
import {
  getWebDemoRuntimeState,
  setWebDemoRuntimeState,
  type WebDemoGithubBinding,
} from "@/lib/web-demo-runtime";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Spinner,
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

const isWebDemoBuild = import.meta.env.VITE_WEB_DEMO_BUILD === "true";

type Notice = {
  message: string;
  tone: "success" | "warning" | "danger";
};

function bindingEventMessage(event: AdminGithubBindingResponse["lastEvent"]) {
  if (!event) return null;
  if (event.result === "conflict") return "绑定冲突，原有绑定保持不变。";
  if (event.result === "cancelled") return "GitHub 授权已取消，原有绑定保持不变。";
  if (event.result === "failure") return "绑定未完成，原有绑定保持不变。";
  if (event.action === "unbind") return "GitHub 管理员身份已解绑。";
  return "GitHub 管理员身份已绑定。";
}

function updateDemoBinding(binding: WebDemoGithubBinding) {
  const runtime = getWebDemoRuntimeState(window.location, "admin");
  setWebDemoRuntimeState({
    ...runtime,
    environment: { ...runtime.environment, githubBinding: binding },
  });
}

export function GithubBindingPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showUnbindConfirm, setShowUnbindConfirm] = useState(false);
  const unbindTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bindingQuery = useQuery({
    queryKey: ["admin-github-binding"],
    queryFn: adminApi.getGithubBinding,
  });

  const bindMutation = useMutation({
    mutationFn: adminApi.simulateGithubBinding,
    onSuccess: (result) => {
      if (isWebDemoBuild) updateDemoBinding("bound");
      setNotice({ tone: "success", message: result.message });
      queryClient.invalidateQueries({ queryKey: ["admin-github-binding"] });
    },
  });

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("binding");
    if (!result) return;
    setNotice({
      tone:
        result === "success"
          ? "success"
          : result === "cancelled" || result === "conflict"
            ? "warning"
            : "danger",
      message:
        result === "success"
          ? "GitHub 管理员身份已绑定，新的 reader session 已就绪。"
          : result === "cancelled"
            ? "GitHub 授权已取消，原有绑定保持不变。"
            : result === "conflict"
              ? "这个 GitHub 身份已有绑定，原有绑定保持不变。"
              : "GitHub 绑定未完成，原有绑定保持不变。",
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("binding");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const unbindMutation = useMutation({
    mutationFn: adminApi.unbindGithubBinding,
    onSuccess: (result) => {
      if (isWebDemoBuild) updateDemoBinding("unbound");
      setNotice({ tone: "success", message: result.message });
      setShowUnbindConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["admin-github-binding"] });
    },
  });

  function startBinding() {
    if (isWebDemoBuild) {
      bindMutation.mutate();
      return;
    }
    const url = new URL(toPublicApiUrl("/api/public/reader-auth/github/binding/start"));
    url.searchParams.set("returnTo", window.location.href.split("?")[0]);
    window.location.assign(url.toString());
  }

  const binding = bindingQuery.data?.binding;
  const lastEvent = bindingQuery.data?.lastEvent;

  return (
    <div className="space-y-6">
      <PageHeader
        title="GitHub 身份"
        description="管理唯一管理员与 GitHub 公开身份之间的绑定。"
        actions={
          <Button
            variant="outline"
            onClick={() => void bindingQuery.refetch()}
            disabled={bindingQuery.isFetching}
          >
            {bindingQuery.isFetching ? <Spinner /> : <RefreshCcw className="size-4" />}
            刷新
          </Button>
        }
      />

      {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}
      {bindingQuery.error ? (
        <Alert tone="danger">{getErrorMessage(bindingQuery.error)}</Alert>
      ) : null}
      {lastEvent && lastEvent.result !== "success" ? (
        <Alert tone={lastEvent.result === "conflict" ? "warning" : "danger"}>
          {bindingEventMessage(lastEvent)}
          <span className="ml-2 text-xs opacity-80">可重新发起绑定。</span>
        </Alert>
      ) : null}
      {unbindMutation.error ? (
        <Alert tone="danger">{getErrorMessage(unbindMutation.error)}</Alert>
      ) : null}
      {bindMutation.error ? (
        <Alert tone="danger">{getErrorMessage(bindMutation.error)}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                <Link2 className="size-5" />
              </span>
              <div className="min-w-0">
                <CardTitle>管理员评论身份</CardTitle>
                <CardDescription>
                  绑定后的 GitHub reader session 才能以管理员作者身份直接公开评论。
                </CardDescription>
              </div>
            </div>
            <Badge
              className="shrink-0 whitespace-nowrap"
              tone={bindingQuery.error ? "warning" : binding ? "success" : "outline"}
            >
              {bindingQuery.isLoading
                ? "加载中"
                : bindingQuery.error
                  ? "状态未知"
                  : binding
                    ? "已绑定"
                    : "未绑定"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {bindingQuery.isLoading ? (
            <div
              className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
              aria-label="正在加载绑定状态"
            >
              <Spinner /> 正在加载绑定状态…
            </div>
          ) : bindingQuery.error ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-foreground">暂时无法读取绑定状态</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  当前状态未知，请重试后再进行绑定或解绑。
                </div>
              </div>
              <Button variant="outline" onClick={() => void bindingQuery.refetch()}>
                <RefreshCcw className="size-4" />
                重试
              </Button>
            </div>
          ) : binding ? (
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                {/* biome-ignore lint/performance/noImgElement: GitHub avatar is a remote profile image in a framework-neutral admin shell */}
                <img
                  src={binding.avatarUrl || "/site-assets/default-avatar.svg"}
                  alt={binding.githubLogin}
                  className="size-12 shrink-0 rounded-full object-cover"
                  width={48}
                  height={48}
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">
                    {binding.displayName || binding.githubLogin}
                  </div>
                  <a
                    className="mt-1 block truncate text-sm text-primary hover:underline"
                    href={binding.profileUrl || `https://github.com/${binding.githubLogin}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{binding.githubLogin}
                  </a>
                  <div className="mt-1 text-xs text-muted-foreground">
                    更新于 {formatDateTime(binding.updatedAt)}
                  </div>
                </div>
              </div>
              <Button
                ref={unbindTriggerRef}
                className="w-full sm:w-auto"
                variant="destructive"
                onClick={() => setShowUnbindConfirm(true)}
                disabled={unbindMutation.isPending || bindMutation.isPending}
              >
                {unbindMutation.isPending ? <Spinner /> : <Unlink className="size-4" />}
                解绑
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-foreground">尚未绑定 GitHub 身份</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  绑定完成后，新的管理员评论会直接公开并显示“管理员”标记。
                </div>
              </div>
              <Button onClick={startBinding} disabled={bindMutation.isPending}>
                {bindMutation.isPending ? <Spinner /> : <Link2 className="size-4" />}
                绑定 GitHub
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showUnbindConfirm}
        onOpenChange={setShowUnbindConfirm}
        destructive
        title="解绑 GitHub 身份"
        description="解绑只影响后续新评论；已经发表的管理员评论会保留公开状态和管理员标记。"
        confirmLabel="确认解绑"
        confirmPending={unbindMutation.isPending}
        returnFocusRef={unbindTriggerRef}
        onConfirm={async () => {
          await unbindMutation.mutateAsync();
        }}
      />
    </div>
  );
}
