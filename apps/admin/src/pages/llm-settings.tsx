import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BrainCircuit, ExternalLink, FlaskConical, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { adminApi } from "@/lib/admin-api-client";
import {
  type LlmModelCapability,
  type LlmModelOption,
  type LlmModelSource,
  toBuiltinLlmModelOptions,
} from "@/lib/llm-models";
import type {
  AdminLlmSettingsPayload,
  AdminLlmSettingsTestResponse,
  AdminLlmSettingsUpdateInput,
  LlmTier,
} from "@/lib/llm-settings";
import { LlmModelPicker } from "~/components/llm-model-picker";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldLabel,
  Input,
  Spinner,
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

type SettingsEditor = AdminLlmSettingsUpdateInput;

type PickerState = {
  open: boolean;
  tier: LlmTier;
};

const TIER_META: Record<LlmTier, { title: string; accent: string }> = {
  chat: {
    title: "对话模型",
    accent: "对话 / 标签分组 / 图标精排",
  },
  embedding: {
    title: "嵌入模型",
    accent: "向量化 / 语义检索",
  },
  rerank: {
    title: "重排序模型",
    accent: "增强检索重排",
  },
};

const TIER_MODEL_CAPABILITIES: Record<LlmTier, LlmModelCapability[]> = {
  chat: ["chat", "reasoning", "coding", "multimodal", "routing"],
  embedding: ["embedding"],
  rerank: ["rerank"],
};

function filterModelsForTier(models: LlmModelOption[], tier: LlmTier): LlmModelOption[] {
  const allowedCapabilities = TIER_MODEL_CAPABILITIES[tier];
  return models.filter((model) => {
    if (!model.capabilities || model.capabilities.length === 0) return true;
    return model.capabilities.some((capability) => allowedCapabilities.includes(capability));
  });
}

function settingsToEditor(payload: AdminLlmSettingsPayload): SettingsEditor {
  return {
    chat: {
      model: payload.settings.chat.model,
      baseUrl: payload.settings.chat.baseUrl,
      apiKeyInput: "",
      clearApiKey: false,
    },
    embedding: {
      model: payload.settings.embedding.model,
      useCustomProvider: payload.settings.embedding.useCustomProvider,
      baseUrlMode: payload.settings.embedding.baseUrlMode,
      baseUrl: payload.settings.embedding.baseUrl,
      apiKeyMode: payload.settings.embedding.apiKeyMode,
      apiKeyInput: "",
      clearApiKey: false,
    },
    rerank: {
      model: payload.settings.rerank.model,
      useCustomProvider: payload.settings.rerank.useCustomProvider,
      baseUrlMode: payload.settings.rerank.baseUrlMode,
      baseUrl: payload.settings.rerank.baseUrl,
      apiKeyMode: payload.settings.rerank.apiKeyMode,
      apiKeyInput: "",
      clearApiKey: false,
    },
  };
}

function areEditorsEqual(left: SettingsEditor | null, right: SettingsEditor | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function SecretField({
  label,
  value,
  clear,
  showClearControl,
  placeholder,
  inputAriaLabel,
  onChange,
  onClearChange,
}: {
  label: string;
  value: string;
  clear: boolean;
  showClearControl?: boolean;
  placeholder: string;
  inputAriaLabel?: string;
  onChange: (value: string) => void;
  onClearChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        {showClearControl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onClearChange(!clear)}
            className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
          >
            {clear ? "取消清除" : "清除已保存的 API Key"}
          </Button>
        ) : null}
      </div>

      <Input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={inputAriaLabel}
        placeholder={clear ? "保存后将清除当前 API Key" : placeholder}
      />
    </div>
  );
}

const TEST_PROGRESS_LABELS = ["正在校验配置…", "正在连接模型提供方…", "正在等待测试结果…"];

function TestResultPopover({
  tier,
  open,
  busy,
  progressIndex,
  result,
  error,
  onClose,
}: {
  tier: LlmTier;
  open: boolean;
  busy: boolean;
  progressIndex: number;
  result: AdminLlmSettingsTestResponse | null;
  error: unknown;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-border bg-card p-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{TIER_META[tier].title}测试</div>
          <div className="text-xs text-muted-foreground">
            {busy ? TEST_PROGRESS_LABELS[progressIndex] : "显示最近一次测试结果"}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label="关闭测试结果"
        >
          <X className="size-4" />
        </Button>
      </div>

      {busy ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          <span>{TEST_PROGRESS_LABELS[progressIndex]}</span>
        </div>
      ) : result ? (
        <div className="space-y-3">
          <Alert tone="success">{result.summary}</Alert>
          <div className="space-y-1 text-xs text-muted-foreground">
            {result.details.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      ) : error ? (
        <Alert tone="danger">{getErrorMessage(error)}</Alert>
      ) : (
        <div className="text-sm text-muted-foreground">点击测试后会在这里显示进度和结果。</div>
      )}
    </div>
  );
}

function TierCard({
  tier,
  editor,
  settings,
  resolved,
  onOpenPicker,
  onChange,
}: {
  tier: LlmTier;
  editor: SettingsEditor;
  settings: AdminLlmSettingsPayload["settings"];
  resolved: AdminLlmSettingsPayload["resolved"];
  onOpenPicker: (tier: LlmTier) => void;
  onChange: (next: SettingsEditor) => void;
}) {
  const meta = TIER_META[tier];
  const tierSettings = settings[tier];
  const tierResolved = resolved[tier];
  const tierEditor = editor[tier];
  const supportsAdvancedProvider = tier !== "chat";
  const childEditor = supportsAdvancedProvider
    ? (editor[tier as "embedding" | "rerank"] as SettingsEditor["embedding"])
    : null;
  const useCustomProvider = childEditor?.useCustomProvider ?? true;
  const hasSavedApiKeyOverride = tierSettings.apiKey.source === "db";
  const apiKeyPlaceholder = tierSettings.apiKey.maskedValue || "当前未配置 API Key";
  const modelPlaceholder = tierResolved.model || "当前未配置模型";
  const baseUrlPlaceholder = tierResolved.baseUrl || "当前未配置 baseURL";
  const [testOpen, setTestOpen] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);

  const testMutation = useMutation({
    mutationFn: () => adminApi.testLlmSettings(tier, editor),
  });

  useEffect(() => {
    if (!testMutation.isPending) {
      setProgressIndex(0);
      return;
    }
    setProgressIndex(0);
    const timer = window.setInterval(() => {
      setProgressIndex((current) => Math.min(current + 1, TEST_PROGRESS_LABELS.length - 1));
    }, 700);
    return () => window.clearInterval(timer);
  }, [testMutation.isPending]);

  return (
    <Card>
      <CardHeader>
        <div>
          <div>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="size-5 text-primary" />
              {meta.title}
            </CardTitle>
            <CardDescription>{meta.accent}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <FieldLabel>模型 ID</FieldLabel>
            <Input
              value={tierEditor.model}
              onChange={(event) =>
                onChange({
                  ...editor,
                  [tier]: { ...tierEditor, model: event.target.value },
                })
              }
              aria-label={`${meta.title} 模型 ID`}
              placeholder={modelPlaceholder}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => onOpenPicker(tier)} aria-label={`选择${meta.title}`}>
              <WandSparkles className="size-4" />
              选择模型
            </Button>
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTestOpen(true);
                  testMutation.mutate();
                }}
                disabled={testMutation.isPending}
                aria-label={`测试${meta.title}`}
              >
                {testMutation.isPending ? <Spinner /> : <FlaskConical className="size-4" />}
                测试
              </Button>
              <TestResultPopover
                tier={tier}
                open={testOpen}
                busy={testMutation.isPending}
                progressIndex={progressIndex}
                result={testMutation.data ?? null}
                error={testMutation.error}
                onClose={() => setTestOpen(false)}
              />
            </div>
          </div>
        </div>

        {supportsAdvancedProvider ? (
          <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">高级设置</div>
              <div className="text-xs text-muted-foreground">
                开启后显示独立 BaseURL / API Key，并要求必填
              </div>
            </div>
            <Switch
              aria-label={`${meta.title} 高级设置`}
              checked={useCustomProvider}
              onCheckedChange={(checked) =>
                onChange({
                  ...editor,
                  [tier]: {
                    ...tierEditor,
                    useCustomProvider: checked,
                    baseUrlMode: checked ? "custom" : "inherit",
                    apiKeyMode: checked ? "custom" : "inherit",
                    clearApiKey: checked ? tierEditor.clearApiKey : false,
                  },
                })
              }
            />
          </div>
        ) : null}

        {(!supportsAdvancedProvider || useCustomProvider) && (
          <>
            <div>
              <FieldLabel>baseURL</FieldLabel>
              <Input
                type="url"
                value={tierEditor.baseUrl}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange({
                    ...editor,
                    [tier]: {
                      ...tierEditor,
                      baseUrl: value,
                    },
                  });
                }}
                aria-label={`${meta.title} baseURL`}
                placeholder={baseUrlPlaceholder}
              />
            </div>

            <SecretField
              label="API Key"
              value={tierEditor.apiKeyInput}
              clear={Boolean(tierEditor.clearApiKey)}
              showClearControl={hasSavedApiKeyOverride}
              inputAriaLabel={`${meta.title} API Key`}
              placeholder={apiKeyPlaceholder}
              onChange={(value) =>
                onChange({
                  ...editor,
                  [tier]: {
                    ...tierEditor,
                    apiKeyInput: value,
                    clearApiKey: value.trim() ? false : tierEditor.clearApiKey,
                  },
                })
              }
              onClearChange={(value) =>
                onChange({
                  ...editor,
                  [tier]: {
                    ...tierEditor,
                    clearApiKey: value,
                    apiKeyInput: value ? "" : tierEditor.apiKeyInput,
                  },
                })
              }
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function LlmSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin-llm-settings"],
    queryFn: adminApi.getLlmSettings,
  });
  const [editor, setEditor] = useState<SettingsEditor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>({ open: false, tier: "chat" });
  const [pickerSource, setPickerSource] = useState<LlmModelSource>("upstream");
  const builtinModelOptions = useMemo(() => toBuiltinLlmModelOptions(), []);
  const savedEditor = useMemo(
    () => (settingsQuery.data ? settingsToEditor(settingsQuery.data) : null),
    [settingsQuery.data]
  );
  const editorDirty = useMemo(() => !areEditorsEqual(editor, savedEditor), [editor, savedEditor]);
  const upstreamModelsQuery = useQuery({
    queryKey: ["admin-llm-models", "upstream", picker.tier],
    queryFn: () => adminApi.getLlmModels("upstream", picker.tier),
    enabled: picker.open && pickerSource === "upstream",
    retry: false,
  });

  useEffect(() => {
    if (!savedEditor) return;
    if (editor === null || !editorDirty) {
      setEditor(savedEditor);
    }
  }, [editor, editorDirty, savedEditor]);

  const saveMutation = useMutation({
    mutationFn: (payload: SettingsEditor) => adminApi.updateLlmSettings(payload),
    onSuccess: (payload) => {
      queryClient.setQueryData(["admin-llm-settings"], payload);
      queryClient.invalidateQueries({ queryKey: ["admin-llm-models"] });
      setEditor(settingsToEditor(payload));
      setNotice(
        payload.hints.embeddingReindexRequired
          ? "LLM 设置已保存。嵌入配置已变更，当前索引需要重新全量向量化。"
          : payload.hints.embeddingReindexSuggested
            ? "LLM 设置已保存。嵌入提供方配置已变更；如需让索引与新配置一致，请重新全量向量化。"
            : "LLM 设置已保存。"
      );
    },
  });

  const pickerValue = editor ? editor[picker.tier].model : "";
  const pickerModels = filterModelsForTier(
    pickerSource === "builtin" ? builtinModelOptions : (upstreamModelsQuery.data?.models ?? []),
    picker.tier
  );
  const pickerPreferredCapability =
    picker.tier === "embedding" ? "embedding" : picker.tier === "rerank" ? "rerank" : undefined;

  if (settingsQuery.error) {
    return <Alert tone="danger">{getErrorMessage(settingsQuery.error)}</Alert>;
  }

  if (settingsQuery.isLoading || !editor) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
        <Spinner />
        正在加载 LLM 设置…
      </div>
    );
  }

  const payload = settingsQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="LLM 设置"
        description="把对话、嵌入、重排序模型配置持久化到数据库；环境变量只作为缺省值。"
        actions={
          <Button onClick={() => saveMutation.mutate(editor)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "保存中…" : "保存设置"}
          </Button>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {saveMutation.error ? (
        <Alert tone="danger">{getErrorMessage(saveMutation.error)}</Alert>
      ) : null}

      {payload.hints.embeddingReindexRequired ? (
        <Alert tone="warning">
          当前向量索引基于
          <span className="mx-1 font-medium text-foreground">
            {payload.hints.currentIndexedModel || "未知模型"}
          </span>
          生成，而当前有效嵌入模型是
          <span className="mx-1 font-medium text-foreground">
            {payload.hints.currentResolvedModel || "未配置"}
          </span>
          。
          {payload.hints.embeddingConfigUpdatedAt ? (
            <span className="ml-1">
              最近嵌入配置变更：{formatDateTime(payload.hints.embeddingConfigUpdatedAt)}。
            </span>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/content-sync">
                前往内容同步
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          </div>
        </Alert>
      ) : payload.hints.embeddingReindexSuggested ? (
        <Alert tone="warning">
          当前向量索引仍使用模型
          <span className="mx-1 font-medium text-foreground">
            {payload.hints.currentIndexedModel || payload.hints.currentResolvedModel || "未知模型"}
          </span>
          ，但最近的嵌入提供方配置变更晚于当前索引。
          {payload.hints.embeddingConfigUpdatedAt ? (
            <span className="ml-1">
              最近配置变更：{formatDateTime(payload.hints.embeddingConfigUpdatedAt)}。
            </span>
          ) : null}
          <span className="ml-1">
            如需让索引与新的 baseURL / API Key 保持一致，请重新全量向量化。
          </span>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/content-sync">
                前往内容同步
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          </div>
        </Alert>
      ) : null}
      <TierCard
        tier="chat"
        editor={editor}
        settings={payload.settings}
        resolved={payload.resolved}
        onOpenPicker={(tier) => {
          setPickerSource("upstream");
          setPicker({ open: true, tier });
        }}
        onChange={setEditor}
      />
      <TierCard
        tier="embedding"
        editor={editor}
        settings={payload.settings}
        resolved={payload.resolved}
        onOpenPicker={(tier) => {
          setPickerSource("upstream");
          setPicker({ open: true, tier });
        }}
        onChange={setEditor}
      />
      <TierCard
        tier="rerank"
        editor={editor}
        settings={payload.settings}
        resolved={payload.resolved}
        onOpenPicker={(tier) => {
          setPickerSource("upstream");
          setPicker({ open: true, tier });
        }}
        onChange={setEditor}
      />

      <LlmModelPicker
        source={pickerSource}
        onSourceChange={setPickerSource}
        onRefreshUpstream={() => {
          void upstreamModelsQuery.refetch();
        }}
        value={pickerValue}
        onValueChange={(modelId) => {
          setEditor((current) =>
            current
              ? {
                  ...current,
                  [picker.tier]: {
                    ...current[picker.tier],
                    model: modelId,
                  },
                }
              : current
          );
          setPicker((current) => ({ ...current, open: false }));
        }}
        models={pickerModels}
        isLoading={pickerSource === "upstream" && upstreamModelsQuery.isLoading}
        error={
          pickerSource === "upstream" && upstreamModelsQuery.error
            ? getErrorMessage(upstreamModelsQuery.error)
            : null
        }
        open={picker.open}
        onOpenChange={(open) => setPicker((current) => ({ ...current, open }))}
        hideTrigger
        preferredCapability={pickerPreferredCapability}
      />
    </div>
  );
}
