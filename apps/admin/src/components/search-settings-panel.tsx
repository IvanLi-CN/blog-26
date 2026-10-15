import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import { type LlmModelSource, toBuiltinLlmModelOptions } from "@/lib/llm-models";
import {
  type AiSearchMode,
  type SearchPolicy,
  type SearchReason,
  searchPolicySchema,
} from "@/lib/search/settings";
import { LlmModelPicker } from "~/components/llm-model-picker";
import { Alert, Button, Spinner } from "~/components/ui";
import { getErrorMessage } from "~/pages/helpers";
import { SearchPolicyCard } from "./search-policy-card";

const labels: Record<AiSearchMode, string> = { rag: "AI 检索（RAG）", rewrite: "AI 改写" };
const reasons: Record<SearchReason, string> = {
  disabled: "已停用",
  unconfigured: "模型未配置",
  unvalidated: "尚未通过当前配置的质量验证",
  unavailable: "模型服务不可用",
  timeout: "模型请求超时",
  "invalid-output": "结果未通过质量校验",
  "budget-exceeded": "超出资源预算",
  "empty-query": "查询为空",
  "explicit-query": "精确检索语法",
};

function ValidationStatus({ mode, runId }: { mode: AiSearchMode; runId?: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["search-validation", runId],
    queryFn: () => adminApi.getSearchValidation(runId ?? ""),
    enabled: Boolean(runId),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 500 : false),
  });
  useEffect(() => {
    if (query.data && query.data.status !== "running")
      void client.invalidateQueries({ queryKey: ["admin-search-settings"] });
  }, [query.data, client]);
  if (query.error) return <Alert tone="danger">{getErrorMessage(query.error)}</Alert>;
  if (!query.data) return null;
  const run = query.data;
  return (
    <div
      role="status"
      className="text-sm text-muted-foreground"
      aria-label={`${labels[mode]}验证状态`}
    >
      {run.status === "running"
        ? `验证中：${run.completed}/${run.total}`
        : run.status === "passed"
          ? "固定样例验证通过"
          : run.status === "stale"
            ? "配置已更改，旧验证结果失效"
            : `验证失败：${reasons[run.reason ?? "unavailable"]}`}
    </div>
  );
}

export function SearchSettingsPanel({ providerDirty = false }: { providerDirty?: boolean }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-search-settings"],
    queryFn: adminApi.getSearchSettings,
  });
  const [editor, setEditor] = useState<SearchPolicy | null>(null);
  const [runIds, setRunIds] = useState<Partial<Record<AiSearchMode, string>>>({});
  const [picker, setPicker] = useState<AiSearchMode | null>(null);
  const [pickerReturnFocus, setPickerReturnFocus] = useState<HTMLElement | null>(null);
  const [source, setSource] = useState<LlmModelSource>("upstream");
  const models = useQuery({
    queryKey: ["admin-llm-models", "upstream", "chat"],
    queryFn: () => adminApi.getLlmModels("upstream", "chat"),
    enabled: picker !== null && source === "upstream",
    retry: false,
  });
  useEffect(() => {
    if (query.data && editor === null) setEditor(query.data.policy);
  }, [query.data, editor]);
  const save = useMutation({
    mutationFn: (policy: SearchPolicy) => adminApi.updateSearchSettings(policy),
    onSuccess: (data) => {
      client.setQueryData(["admin-search-settings"], data);
      setEditor(data.policy);
    },
  });
  const validate = useMutation({
    mutationFn: adminApi.validateSearchSettings,
    onSuccess: (run) => {
      setRunIds((current) => ({ ...current, [run.mode]: run.id }));
      void client.invalidateQueries({ queryKey: ["admin-search-settings"] });
    },
  });
  if (query.error) return <Alert tone="danger">{getErrorMessage(query.error)}</Alert>;
  if (!query.data || !editor)
    return (
      <div className="flex items-center gap-2">
        <Spinner />
        正在加载搜索设置…
      </div>
    );
  const dirty = JSON.stringify(editor) !== JSON.stringify(query.data.policy);
  const valid = searchPolicySchema.safeParse(editor).success;
  const change = (mode: AiSearchMode, values: Partial<SearchPolicy[AiSearchMode]>) =>
    setEditor((current) =>
      current ? { ...current, [mode]: { ...current[mode], ...values } } : current
    );
  return (
    <section className="space-y-4" aria-label="搜索模式设置">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">搜索模式</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            两种 AI 搜索独立配置。不可用时使用原始关键词全文搜索。
          </p>
        </div>
        <Button disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate(editor)}>
          {save.isPending ? <Spinner /> : null}保存搜索设置
        </Button>
      </div>
      {save.error || validate.error ? (
        <Alert tone="danger">{getErrorMessage(save.error ?? validate.error)}</Alert>
      ) : null}
      {save.isSuccess && !dirty ? (
        <Alert tone="success">搜索设置已保存。变更的模式需要重新验证。</Alert>
      ) : null}
      {!valid ? <Alert tone="warning">请将预算设为允许范围内的整数。</Alert> : null}
      {(["rag", "rewrite"] as const).map((mode) => {
        const policy = editor[mode];
        const status = query.data.status[mode];
        const quality = query.data.quality[mode];
        return (
          <SearchPolicyCard
            key={mode}
            mode={mode}
            policy={policy}
            status={status}
            quality={quality}
            dirty={dirty || providerDirty}
            validating={validate.isPending}
            onChange={(values) => change(mode, values)}
            onChooseModel={(trigger) => {
              setSource("upstream");
              setPickerReturnFocus(trigger);
              setPicker(mode);
            }}
            onValidate={() => validate.mutate(mode)}
            validationStatus={<ValidationStatus mode={mode} runId={runIds[mode]} />}
          />
        );
      })}
      <LlmModelPicker
        hideTrigger
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        returnFocusElement={pickerReturnFocus}
        source={source}
        onSourceChange={setSource}
        onRefreshUpstream={() => {
          void models.refetch();
        }}
        value={picker ? (editor[picker].model ?? "") : ""}
        onValueChange={(model) => {
          if (picker) change(picker, { model });
          setPicker(null);
        }}
        models={
          source === "builtin"
            ? toBuiltinLlmModelOptions().filter(
                (model) =>
                  !model.capabilities?.length ||
                  model.capabilities.some((capability) =>
                    ["chat", "reasoning", "coding", "multimodal", "routing"].includes(capability)
                  )
              )
            : (models.data?.models ?? [])
        }
        isLoading={source === "upstream" && models.isFetching}
        hasLoaded={source === "builtin" || models.isFetched}
        error={models.error ? getErrorMessage(models.error) : null}
      />
    </section>
  );
}
