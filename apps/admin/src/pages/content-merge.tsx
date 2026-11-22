import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  adminApi,
  type ContentRepoActionPayload,
  type ContentRepoDiffPayload,
  type ContentRepoSyncItem,
} from "@/lib/admin-api-client";
import { ContentMediaCompare } from "~/components/content-media-compare";
import { ContentMergeEditor } from "~/components/content-merge-editor";
import { ContentSplitMerge } from "~/components/content-split-merge";
import { ContentThreeWayMerge } from "~/components/content-three-way-merge";
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
  Separator,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

const STATE_LABEL: Record<ContentRepoSyncItem["state"], string> = {
  synced: "已同步",
  "to-push": "待推送",
  "to-pull": "待拉取",
  "remote-new": "远端新增",
  "remote-deleted": "远端删除",
  "merge-conflict": "需要合并",
};

const STATE_TONE: Record<
  ContentRepoSyncItem["state"],
  "default" | "muted" | "success" | "warning" | "danger" | "outline"
> = {
  synced: "success",
  "to-push": "default",
  "to-pull": "outline",
  "remote-new": "warning",
  "remote-deleted": "warning",
  "merge-conflict": "danger",
};

function TextPane({ title, text }: { title: string; text: string | null | undefined }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre className="max-h-80 overflow-auto rounded-2xl bg-muted/46 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
        {text ?? "（无内容）"}
      </pre>
    </div>
  );
}

function conflictSummary(diff: ContentRepoDiffPayload) {
  const parts = [
    ...(diff.conflictingFields ?? []).map((key) => `${key}（frontmatter）`),
    ...(diff.bodyConflicts ? [`正文 ${diff.bodyConflicts} 处`] : []),
  ];
  return parts.length ? `需要人工裁决：${parts.join("、")}` : null;
}

export function ContentRepoDiffView({
  diff,
  onSave,
  mode,
  onModeChange,
}: {
  diff: ContentRepoDiffPayload | undefined;
  onSave?: (text: string) => void;
  mode: "inline" | "split" | "three";
  onModeChange: (mode: "inline" | "split" | "three") => void;
}) {
  if (!diff) return null;
  if (diff.status !== "ready")
    return <Alert tone="warning">{diff.message ?? "差异暂不可用"}</Alert>;
  const summary = conflictSummary(diff);
  return (
    <div className="space-y-3" data-testid="content-repo-diff">
      {summary ? <Alert tone="warning">{summary}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["inline", "行内"],
            ["split", "双栏"],
            ["three", "三路"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={mode === value ? "default" : "outline"}
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {mode === "inline" ? (
        <ContentMergeEditor
          localText={diff.localText ?? ""}
          remoteText={diff.remoteText ?? ""}
          onSave={onSave}
        />
      ) : mode === "split" ? (
        <ContentSplitMerge
          localText={diff.localText ?? ""}
          remoteText={diff.remoteText ?? ""}
          onSave={onSave}
        />
      ) : (
        <ContentThreeWayMerge regions={diff.regions ?? []} onSave={onSave} />
      )}
      <Disclosure summary="基线（共同祖先）">
        <div className="mt-2">
          <TextPane title="基线" text={diff.baseText} />
        </div>
      </Disclosure>
      {diff.mergedText ? <TextPane title="合并预览" text={diff.mergedText} /> : null}
    </div>
  );
}

function actionSummary(result: ContentRepoActionPayload) {
  const parts = [result.status];
  if (result.merged?.length) parts.push(`已合并 ${result.merged.length}`);
  if (result.paths?.length) parts.push(`已处理 ${result.paths.length}`);
  if (result.conflicts?.length) parts.push(`冲突 ${result.conflicts.length}`);
  if (result.message) parts.push(result.message);
  return parts.join(" · ");
}

export function ContentMergePage() {
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"inline" | "split" | "three">("inline");

  const status = useQuery({
    queryKey: ["content-repo", "status"],
    queryFn: adminApi.getContentRepoStatus,
  });
  const check = useQuery({
    queryKey: ["content-repo", "check"],
    queryFn: adminApi.checkContentRepo,
  });
  const media = useQuery({
    queryKey: ["content-repo", "media", selectedPath],
    queryFn: () => adminApi.getContentRepoMedia(selectedPath ?? ""),
    enabled: Boolean(selectedPath),
  });
  const adoptMedia = useMutation({
    mutationFn: (input: { path: string; media: string }) => adminApi.adoptRemoteMedia(input),
    onSuccess: async (result) => {
      setNotice(
        result.status === "saved"
          ? `已采用远端附件：${result.mediaPath ?? ""}`
          : (result.message ?? result.status)
      );
      await refresh();
    },
    onError: (error) => setNotice(getErrorMessage(error)),
  });
  const diff = useQuery({
    queryKey: ["content-repo", "diff", selectedPath],
    queryFn: () => adminApi.getContentRepoDiff(selectedPath ?? ""),
    enabled: Boolean(selectedPath),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["content-repo"] });
  };
  const onSuccess = async (result: ContentRepoActionPayload) => {
    setNotice(actionSummary(result));
    await refresh();
  };
  const onError = (error: unknown) => setNotice(getErrorMessage(error));

  const merge = useMutation({
    mutationFn: (input: { ids?: string[] }) => adminApi.mergeContentRepo(input),
    onSuccess,
    onError,
  });
  const push = useMutation({
    mutationFn: (input: { ids?: string[] }) => adminApi.pushContentRepo(input),
    onSuccess,
    onError,
  });
  const pull = useMutation({
    mutationFn: (input: { ids?: string[] }) => adminApi.pullContentRepo(input),
    onSuccess,
    onError,
  });
  const accept = useMutation({
    mutationFn: (input: { paths?: string[] }) => adminApi.acceptRemoteContent(input),
    onSuccess,
    onError,
  });
  const resolve = useMutation({
    mutationFn: (input: { path: string; text: string }) => adminApi.resolveContentRepo(input),
    onSuccess: async (result) => {
      setNotice(
        result.status === "saved"
          ? `已保存到内容库：${result.path}`
          : (result.message ?? result.status)
      );
      await refresh();
    },
    onError: (error) => setNotice(getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (input: { paths?: string[] }) => adminApi.removeRemoteDeletedContent(input),
    onSuccess,
    onError,
  });

  const items = [...(check.data?.items ?? [])].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
  const selected = items.find((item) => item.path === selectedPath) ?? null;
  const selectedIds = selectedPath ? [selectedPath] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容差异与合并"
        description="比较本地内容库与内容仓库；冲突需要人工裁决，合并不会自动推送。"
        actions={
          <Button variant="outline" onClick={() => void refresh()} disabled={check.isFetching}>
            {check.isFetching ? <Spinner /> : null}
            重新检查
          </Button>
        }
      />

      {notice ? <Alert tone="default">{notice}</Alert> : null}
      {check.data?.status === "unconfigured" ? (
        <Alert tone="warning">内容仓库未配置：缺少 CONTENT_REPO_TOKEN，编辑与阅读不受影响。</Alert>
      ) : null}
      {check.data?.status === "failed" ? (
        <Alert tone="danger">{check.data.message ?? "检查内容仓库失败"}</Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>内容仓库</CardTitle>
            <CardDescription>
              {status.data?.repository ?? "-"} · {status.data?.ref ?? "-"} · 基线{" "}
              {status.data?.baselines ?? 0}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(check.data?.counts ?? {}).map(([state, count]) => (
                <Badge
                  key={state}
                  tone={STATE_TONE[state as ContentRepoSyncItem["state"]] ?? "muted"}
                >
                  {STATE_LABEL[state as ContentRepoSyncItem["state"]] ?? state} {count}
                </Badge>
              ))}
            </div>
            <Separator />
            {check.isLoading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState title="没有内容" description="内容库为空，或尚未与内容仓库建立基线。" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>对象</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="whitespace-nowrap">附件</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.path}
                        data-selected={item.path === selectedPath ? "true" : undefined}
                        className={item.path === selectedPath ? "bg-muted/46" : undefined}
                      >
                        <TableCell className="max-w-[18rem] truncate">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPath(item.path)}
                          >
                            {item.path}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {item.kind === "memo" ? "闪念" : "文章"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge tone={STATE_TONE[item.state]}>{STATE_LABEL[item.state]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.missingMedia.length
                            ? `缺失 ${item.missingMedia.length}`
                            : item.changedMedia.length
                              ? `变更 ${item.changedMedia.length}`
                              : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selected ? selected.path : "选择一条内容"}</CardTitle>
            <CardDescription>
              {selected
                ? `${STATE_LABEL[selected.state]} · 基线 ${selected.baselineHash?.slice(0, 8) ?? "-"} · 远端 ${selected.remoteSha?.slice(0, 8) ?? "-"}`
                : "左侧列表选择内容后查看三方差异。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <EmptyState title="未选择内容" description="选择一条内容查看基线、本地与远端差异。" />
            ) : (
              <>
                {selected.missingMedia.length ? (
                  <Alert tone="danger">附件缺失：{selected.missingMedia.join("、")}</Alert>
                ) : null}
                {diff.isLoading ? (
                  <Spinner />
                ) : (
                  <ContentRepoDiffView
                    diff={diff.data}
                    mode={mode}
                    onModeChange={setMode}
                    onSave={(text) => selected && resolve.mutate({ path: selected.path, text })}
                  />
                )}
                {media.data?.items?.length ? (
                  <ContentMediaCompare
                    items={media.data.items}
                    busy={adoptMedia.isPending}
                    onAdopt={(mediaPath) =>
                      selected && adoptMedia.mutate({ path: selected.path, media: mediaPath })
                    }
                  />
                ) : null}
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {selected.state === "merge-conflict" ? (
                    <Button onClick={() => merge.mutate({ ids: selectedIds })}>尝试自动合并</Button>
                  ) : null}
                  {selected.state === "to-pull" ? (
                    <Button onClick={() => pull.mutate({ ids: selectedIds })}>拉取到内容库</Button>
                  ) : null}
                  {selected.state === "to-push" ? (
                    <Button onClick={() => push.mutate({ ids: selectedIds })}>推送到仓库</Button>
                  ) : null}
                  {selected.state === "remote-new" ? (
                    <Button onClick={() => accept.mutate({ paths: [selected.path] })}>
                      接受远端新增
                    </Button>
                  ) : null}
                  {selected.state === "remote-deleted" ? (
                    <Button
                      variant="destructive"
                      onClick={() => remove.mutate({ paths: [selected.path] })}
                    >
                      确认远端删除
                    </Button>
                  ) : null}
                  {selected.state === "synced" ? (
                    <p className="text-sm text-muted-foreground">两侧一致，无需操作。</p>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
