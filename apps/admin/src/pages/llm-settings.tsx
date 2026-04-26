import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AudioLines,
  BrainCircuit,
  ExternalLink,
  Eye,
  FlaskConical,
  Layers3,
  Search,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { adminApi } from "@/lib/admin-api-client";
import {
  type AdminLlmSettingsPayload,
  type AdminLlmSettingsTestResponse,
  type AdminLlmSettingsUpdateInput,
  type LlmTier,
  MODEL_CAPABILITY_LABELS,
  type ModelCapability,
  type ModelCatalogEntry,
} from "@/lib/llm-settings";
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
  Spinner,
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

type SettingsEditor = AdminLlmSettingsUpdateInput;

type PickerState = {
  open: boolean;
  tier: LlmTier;
};

type CapabilityFilter = {
  id: string;
  label: string;
  capabilities: ModelCapability[];
  icon: typeof Sparkles;
};

const TIER_META: Record<LlmTier, { title: string; pickerTitle: string; accent: string }> = {
  chat: {
    title: "对话模型",
    pickerTitle: "选择对话模型",
    accent: "对话 / 标签分组 / 图标精排",
  },
  embedding: {
    title: "嵌入模型",
    pickerTitle: "选择嵌入模型",
    accent: "向量化 / 语义检索",
  },
  rerank: {
    title: "重排序模型",
    pickerTitle: "选择重排序模型",
    accent: "增强检索重排",
  },
};

const CAPABILITY_FILTERS: CapabilityFilter[] = [
  { id: "chat", label: "chat/text", capabilities: ["chat"], icon: Sparkles },
  { id: "embeddings", label: "embeddings", capabilities: ["embeddings"], icon: Layers3 },
  { id: "rerank", label: "rerank", capabilities: ["rerank"], icon: Search },
  { id: "vision", label: "vision", capabilities: ["vision"], icon: Eye },
  { id: "audio", label: "audio", capabilities: ["audio"], icon: AudioLines },
  {
    id: "tools",
    label: "tools/structured-output",
    capabilities: ["tools", "structured-output"],
    icon: WandSparkles,
  },
];

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

function formatContextLength(value: number | null) {
  if (!value) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function getCapabilityBadges(entry: ModelCatalogEntry) {
  const labels: string[] = [];
  if (entry.capabilities.includes("chat")) labels.push(MODEL_CAPABILITY_LABELS.chat);
  if (entry.capabilities.includes("embeddings")) labels.push(MODEL_CAPABILITY_LABELS.embeddings);
  if (entry.capabilities.includes("rerank")) labels.push(MODEL_CAPABILITY_LABELS.rerank);
  if (entry.capabilities.includes("vision")) labels.push(MODEL_CAPABILITY_LABELS.vision);
  if (entry.capabilities.includes("audio")) labels.push(MODEL_CAPABILITY_LABELS.audio);
  if (entry.capabilities.includes("tools") || entry.capabilities.includes("structured-output")) {
    labels.push("tools/structured-output");
  }
  return [...new Set(labels)];
}

function ModelPickerDialog({
  open,
  tier,
  currentValue,
  onClose,
  onPick,
}: {
  open: boolean;
  tier: LlmTier;
  currentValue: string;
  onClose: () => void;
  onPick: (modelId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setActiveFilters([]);
  }, [open]);

  const catalogQuery = useQuery({
    queryKey: ["admin-llm-settings-catalog", tier],
    queryFn: () => adminApi.getLlmCatalog(tier),
    enabled: open,
    staleTime: 60_000,
  });

  const filteredItems = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return (catalogQuery.data?.items ?? []).filter((item) => {
      if (searchText) {
        const haystack = `${item.name} ${item.id} ${item.description ?? ""}`.toLowerCase();
        if (!haystack.includes(searchText)) {
          return false;
        }
      }

      if (activeFilters.length === 0) return true;
      const matchedFilters = CAPABILITY_FILTERS.filter((filter) =>
        activeFilters.includes(filter.id)
      );
      return matchedFilters.some((filter) =>
        filter.capabilities.some((capability) => item.capabilities.includes(capability))
      );
    });
  }, [activeFilters, catalogQuery.data?.items, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`llm-model-picker-${tier}`}
    >
      <Card className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle id={`llm-model-picker-${tier}`}>{TIER_META[tier].pickerTitle}</CardTitle>
              <CardDescription>从内置目录里筛选并回填模型 ID；当前值会高亮显示。</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭模型选择器">
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <FieldLabel>搜索模型</FieldLabel>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="按名称、ID、描述搜索"
              />
            </div>
            <div className="text-xs text-muted-foreground lg:self-end">
              当前目录：{catalogQuery.data?.source ?? "loading"}
              {catalogQuery.data?.generatedAt ? ` · 快照 ${catalogQuery.data.generatedAt}` : ""}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {CAPABILITY_FILTERS.map((filter) => {
              const Icon = filter.icon;
              const active = activeFilters.includes(filter.id);
              return (
                <Button
                  key={filter.id}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() =>
                    setActiveFilters((current) =>
                      current.includes(filter.id)
                        ? current.filter((item) => item !== filter.id)
                        : [...current, filter.id]
                    )
                  }
                >
                  <Icon className="size-3.5" />
                  {filter.label}
                </Button>
              );
            })}
          </div>

          {catalogQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-3 text-sm text-muted-foreground">
              <Spinner />
              正在加载模型目录…
            </div>
          ) : catalogQuery.error ? (
            <Alert tone="danger">{getErrorMessage(catalogQuery.error)}</Alert>
          ) : (
            <div className="admin-scrollbar flex-1 overflow-y-auto rounded-xl border border-border">
              <div className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const isCurrent = currentValue.trim() === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-muted/40"
                      onClick={() => {
                        onPick(item.id);
                        onClose();
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-foreground">{item.name}</div>
                            {isCurrent ? <Badge tone="success">current</Badge> : null}
                            {item.availableOnProvider === true ? (
                              <Badge tone="success">provider available</Badge>
                            ) : item.availableOnProvider === false ? (
                              <Badge tone="warning">provider missing</Badge>
                            ) : (
                              <Badge tone="outline">provider unchecked</Badge>
                            )}
                            <Badge tone="muted">{item.source}</Badge>
                          </div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {item.id}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          上下文 {formatContextLength(item.contextLength)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {getCapabilityBadges(item).map((label) => (
                          <Badge key={`${item.id}-${label}`} tone="outline">
                            {label}
                          </Badge>
                        ))}
                      </div>

                      {item.description ? (
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                      ) : null}
                    </button>
                  );
                })}

                {filteredItems.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">没有匹配的模型。</div>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

  useEffect(() => {
    if (!settingsQuery.data) return;
    setEditor(settingsToEditor(settingsQuery.data));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: SettingsEditor) => adminApi.updateLlmSettings(payload),
    onSuccess: (payload) => {
      queryClient.setQueryData(["admin-llm-settings"], payload);
      queryClient.invalidateQueries({ queryKey: ["admin-llm-settings-catalog"] });
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
        onOpenPicker={(tier) => setPicker({ open: true, tier })}
        onChange={setEditor}
      />
      <TierCard
        tier="embedding"
        editor={editor}
        settings={payload.settings}
        resolved={payload.resolved}
        onOpenPicker={(tier) => setPicker({ open: true, tier })}
        onChange={setEditor}
      />
      <TierCard
        tier="rerank"
        editor={editor}
        settings={payload.settings}
        resolved={payload.resolved}
        onOpenPicker={(tier) => setPicker({ open: true, tier })}
        onChange={setEditor}
      />

      <ModelPickerDialog
        open={picker.open}
        tier={picker.tier}
        currentValue={pickerValue}
        onClose={() => setPicker((current) => ({ ...current, open: false }))}
        onPick={(modelId) =>
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
          )
        }
      />
    </div>
  );
}
