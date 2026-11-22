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

type FileRow = {
  key: string;
  path: string;
  label: "文章" | "闪念" | "附件";
  item: ContentRepoSyncItem;
  media?: { path: string; missing: boolean };
};

/** One row per file: documents and attachments never share a merge surface. */
function buildFileRows(items: ContentRepoSyncItem[]): FileRow[] {
  const rows = new Map<string, FileRow>();
  for (const item of items) {
    if (rows.has(item.path)) continue;
    rows.set(item.path, {
      key: item.path,
      path: item.path,
      label: item.kind === "memo" ? "闪念" : "文章",
      item,
    });
  }
  for (const item of items) {
    for (const mediaPath of [...item.missingMedia, ...item.changedMedia]) {
      if (rows.has(mediaPath)) continue;
      rows.set(mediaPath, {
        key: mediaPath,
        path: mediaPath,
        label: "附件",
        item,
        media: { path: mediaPath, missing: item.missingMedia.includes(mediaPath) },
      });
    }
  }
  return [...rows.values()].sort((left, right) => left.path.localeCompare(right.path));
}

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
        <ContentThreeWayMerge
          regions={diff.regions ?? []}
          localText={diff.localText ?? ""}
          baseText={diff.baseText ?? ""}
          remoteText={diff.remoteText ?? ""}
          onSave={onSave}
        />
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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
  const rows = buildFileRows(check.data?.items ?? []);
  const selected = rows.find((row) => row.key === selectedKey) ?? null;
  const media = useQuery({
    queryKey: ["content-repo", "media", selected?.item.path],
    queryFn: () => adminApi.getContentRepoMedia(selected?.item.path ?? ""),
    enabled: Boolean(selected?.media),
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
    queryKey: ["content-repo", "diff", selected?.path],
    queryFn: () => adminApi.getContentRepoDiff(selected?.path ?? ""),
    enabled: Boolean(selected && !selected.media),
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

      <div className="space-y-6">
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
            ) : rows.length === 0 ? (
              <EmptyState title="没有内容" description="内容库为空，或尚未与内容仓库建立基线。" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文件</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.key}
                        data-selected={row.key === selectedKey ? "true" : undefined}
                        className={row.key === selectedKey ? "bg-muted/46" : undefined}
                      >
                        <TableCell className="max-w-[18rem] truncate">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedKey(row.key)}>
                            {row.path}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {row.label}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.media ? (
                            <Badge tone={row.media.missing ? "danger" : "warning"}>
                              {row.media.missing ? "附件缺失" : "附件变更"}
                            </Badge>
                          ) : (
                            <Badge tone={STATE_TONE[row.item.state]}>
                              {STATE_LABEL[row.item.state]}
                            </Badge>
                          )}
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
            <CardTitle>{selected ? selected.path : "选择一个文件"}</CardTitle>
            <CardDescription>
              {!selected
                ? "左侧列表选择一个文件后查看三方差异。"
                : selected.media
                  ? `附件文件 · 所属 ${selected.item.path} · ${selected.media.missing ? "本地缺失" : "两侧不同"}`
                  : `${STATE_LABEL[selected.item.state]} · 基线 ${selected.item.baselineHash?.slice(0, 8) ?? "-"} · 远端 ${selected.item.remoteSha?.slice(0, 8) ?? "-"}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <EmptyState title="未选择文件" description="选择一条文件查看基线、本地与远端差异。" />
            ) : selected.media ? (
              <>
                {selected.media.missing ? (
                  <Alert tone="danger">本地缺少这个附件文件。</Alert>
                ) : null}
                {media.isLoading ? (
                  <Spinner />
                ) : media.data?.items?.length ? (
                  <ContentMediaCompare
                    items={media.data.items.filter((entry) => entry.path === selected.media?.path)}
                    busy={adoptMedia.isPending}
                    onAdopt={(mediaPath) =>
                      adoptMedia.mutate({ path: selected.item.path, media: mediaPath })
                    }
                  />
                ) : (
                  <EmptyState
                    title="附件暂不可预览"
                    description="远端没有提供这个文件的可读版本。"
                  />
                )}
              </>
            ) : (
              <>
                {diff.isLoading ? (
                  <Spinner />
                ) : (
                  <ContentRepoDiffView
                    diff={diff.data}
                    mode={mode}
                    onModeChange={setMode}
                    onSave={(text) => resolve.mutate({ path: selected.path, text })}
                  />
                )}
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {selected.item.state === "merge-conflict" ? (
                    <Button onClick={() => merge.mutate({ ids: [selected.path] })}>
                      尝试自动合并
                    </Button>
                  ) : null}
                  {selected.item.state === "to-pull" ? (
                    <Button onClick={() => pull.mutate({ ids: [selected.path] })}>
                      拉取到内容库
                    </Button>
                  ) : null}
                  {selected.item.state === "to-push" ? (
                    <Button onClick={() => push.mutate({ ids: [selected.path] })}>
                      推送到仓库
                    </Button>
                  ) : null}
                  {selected.item.state === "remote-new" ? (
                    <Button onClick={() => accept.mutate({ paths: [selected.path] })}>
                      接受远端新增
                    </Button>
                  ) : null}
                  {selected.item.state === "remote-deleted" ? (
                    <Button
                      variant="destructive"
                      onClick={() => remove.mutate({ paths: [selected.path] })}
                    >
                      确认远端删除
                    </Button>
                  ) : null}
                  {selected.item.state === "synced" ? (
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
