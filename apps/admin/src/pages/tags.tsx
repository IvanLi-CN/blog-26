import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import { type LlmModelSource, toBuiltinLlmModelOptions } from "@/lib/llm-models";
import type { TagGroup } from "@/types/tag-groups";
import { LlmModelPicker } from "~/components/llm-model-picker";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldLabel,
  Input,
  Textarea,
} from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

export function TagsPage() {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["admin-tags-overview"],
    queryFn: adminApi.getTagsOverview,
  });
  const [targetGroups, setTargetGroups] = useState("8");
  const [model, setModel] = useState("");
  const [modelSource, setModelSource] = useState<LlmModelSource>("upstream");
  const [draftJson, setDraftJson] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const builtinModelOptions = useMemo(() => toBuiltinLlmModelOptions(), []);
  const upstreamModelsQuery = useQuery({
    queryKey: ["admin-llm-models", "upstream"],
    queryFn: () => adminApi.getLlmModels("upstream"),
    enabled: modelSource === "upstream",
    retry: false,
  });

  useEffect(() => {
    if (!overviewQuery.data) return;
    setDraftJson(JSON.stringify(overviewQuery.data.groups, null, 2));
    setModel(overviewQuery.data.initialModel ?? "");
  }, [overviewQuery.data]);

  useEffect(() => {
    if (modelSource !== "builtin") return;
    if (model && !builtinModelOptions.some((option) => option.id === model)) {
      setModel("");
    }
  }, [builtinModelOptions, model, modelSource]);

  const organizeMutation = useMutation({
    mutationFn: () =>
      adminApi.organizeTags({
        targetGroups: Number(targetGroups) || undefined,
        model: model || undefined,
        persist: false,
      }),
    onSuccess: (data) => {
      if (data.data?.groups) {
        setDraftJson(JSON.stringify(data.data.groups, null, 2));
      }
      setNotice(data.data?.notes ?? "AI 已返回新的分组建议。\n记得检查 JSON 后再保存。");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (groups: TagGroup[]) => adminApi.saveTagGroups(groups),
    onSuccess: () => {
      setNotice("标签分组已保存。\n公开站下一次读取配置时会拿到最新结果。");
      queryClient.invalidateQueries({ queryKey: ["admin-tags-overview"] });
    },
  });

  const ungroupedTags = useMemo(() => {
    const grouped = new Set((overviewQuery.data?.groups ?? []).flatMap((group) => group.tags));
    return (overviewQuery.data?.tagSummaries ?? []).filter((tag) => !grouped.has(tag.name));
  }, [overviewQuery.data]);

  function handleSave() {
    try {
      const parsed = JSON.parse(draftJson) as TagGroup[];
      saveMutation.mutate(parsed);
    } catch (error) {
      setNotice(`JSON 解析失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="标签分组"
        description="用 AI 生成建议，再把最终 JSON 保存回数据库。"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => organizeMutation.mutate()}
              disabled={organizeMutation.isPending}
            >
              <WandSparkles className="size-4" />
              {organizeMutation.isPending ? "生成中" : "AI 重新分组"}
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              保存分组
            </Button>
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {overviewQuery.error ? (
        <Alert tone="danger">{getErrorMessage(overviewQuery.error)}</Alert>
      ) : null}
      {organizeMutation.error ? (
        <Alert tone="danger">{getErrorMessage(organizeMutation.error)}</Alert>
      ) : null}
      {saveMutation.error ? (
        <Alert tone="danger">{getErrorMessage(saveMutation.error)}</Alert>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[180px_360px_minmax(0,1fr)]">
          <div>
            <FieldLabel>目标分组数</FieldLabel>
            <Input value={targetGroups} onChange={(event) => setTargetGroups(event.target.value)} />
          </div>
          <div>
            <LlmModelPicker
              source={modelSource}
              onSourceChange={setModelSource}
              onRefreshUpstream={() => {
                void upstreamModelsQuery.refetch();
              }}
              value={model}
              onValueChange={setModel}
              models={
                modelSource === "builtin"
                  ? builtinModelOptions
                  : (upstreamModelsQuery.data?.models ?? [])
              }
              isLoading={modelSource === "upstream" && upstreamModelsQuery.isLoading}
              error={
                modelSource === "upstream" && upstreamModelsQuery.error
                  ? getErrorMessage(upstreamModelsQuery.error)
                  : null
              }
              preferredCapability="chat"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            当前标签总数：
            <span className="ml-1 font-medium text-foreground">
              {overviewQuery.data?.tagSummaries.length ?? 0}
            </span>
            <span className="mx-2">·</span>
            已配置分组：
            <span className="ml-1 font-medium text-foreground">
              {overviewQuery.data?.groups.length ?? 0}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>当前分组预览</CardTitle>
            <CardDescription>只读概览，便于快速检查覆盖情况。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(overviewQuery.data?.groups ?? []).map((group) => (
              <div key={group.key} className="rounded-xl border border-border bg-muted/50 p-4">
                <div className="font-medium">{group.title}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.tags.slice(0, 16).map((tag) => (
                    <Badge key={tag} tone="outline">
                      {tag}
                    </Badge>
                  ))}
                  {group.tags.length > 16 ? (
                    <Badge tone="muted">+{group.tags.length - 16}</Badge>
                  ) : null}
                </div>
              </div>
            ))}

            {ungroupedTags.length > 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4">
                <div className="font-medium">未分组标签</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ungroupedTags.slice(0, 20).map((tag) => (
                    <Badge key={tag.name} tone="warning">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>可编辑 JSON</CardTitle>
            <CardDescription>你可以直接修改数组后保存。</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-[620px] font-mono text-xs"
              value={draftJson}
              onChange={(event) => setDraftJson(event.target.value)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
