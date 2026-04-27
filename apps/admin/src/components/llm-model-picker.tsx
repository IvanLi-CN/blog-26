import { AlertCircle, Check, Database, Server, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { LlmModelCapability, LlmModelOption, LlmModelSource } from "@/lib/llm-models";
import { cn } from "@/lib/utils";
import { Alert, Button, FieldLabel, Input, Spinner } from "~/components/ui";

export interface LlmModelPickerProps {
  source: LlmModelSource;
  onSourceChange: (source: LlmModelSource) => void;
  onRefreshUpstream?: () => void;
  value: string;
  onValueChange: (value: string) => void;
  models: LlmModelOption[];
  isLoading?: boolean;
  error?: string | null;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  preferredCapability?: LlmModelCapability;
}

export function LlmModelPicker({
  source,
  onSourceChange,
  onRefreshUpstream,
  value,
  onValueChange,
  models,
  isLoading = false,
  error,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  preferredCapability,
}: LlmModelPickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen);
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
  };
  const [filter, setFilter] = useState("");
  const [capabilityFilter, setCapabilityFilter] = useState<LlmModelCapability | "all">(
    preferredCapability ?? "all"
  );
  const fallbackCapability = preferredCapability ?? "chat";
  const selectedModel = models.find((model) => model.id === value);
  const displayedModel =
    selectedModel ?? (value.trim() ? customModelOption(value, source, fallbackCapability) : null);
  const capabilityFilters = getCapabilityFilters(models, fallbackCapability);
  const activeCapabilityFilter = capabilityFilters.some((item) => item.key === capabilityFilter)
    ? capabilityFilter
    : "all";
  const categoryModels = filterModelsByCapability(
    models,
    activeCapabilityFilter,
    fallbackCapability
  );
  const filteredModels = filterModels(categoryModels, filter);
  const customModel = createCustomModelOption(models, filter, source, fallbackCapability);
  const displayedCustomModel =
    customModel &&
    (activeCapabilityFilter === "all" ||
      getModelCapabilities(customModel, fallbackCapability).includes(activeCapabilityFilter))
      ? customModel
      : null;

  useEffect(() => {
    if (!open) return;
    setFilter("");
    setCapabilityFilter(preferredCapability ?? "all");
  }, [open, preferredCapability]);

  return (
    <>
      {hideTrigger ? null : (
        <div className="space-y-2">
          <FieldLabel>模型</FieldLabel>
          <button
            type="button"
            className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen(true)}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {displayedModel?.name ?? "留空则用默认模型"}
              </span>
              {displayedModel ? (
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {displayedModel.id}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
              选择模型
            </span>
          </button>
        </div>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/72 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="llm-model-picker-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="关闭模型选择"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                <h2 id="llm-model-picker-title" className="text-lg font-semibold">
                  选择模型
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  默认从上游获取模型名，并用内置模型数据库补充展示信息。
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-3 overflow-y-auto p-5">
              <div className="space-y-2" aria-busy={isLoading}>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Input
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="搜索模型，或输入自定义模型 ID"
                      aria-label="过滤模型"
                      className={isLoading ? "pr-24" : undefined}
                    />
                    {isLoading ? (
                      <span className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground">
                        <Spinner />
                        加载中
                      </span>
                    ) : null}
                  </div>
                  <div className="flex justify-start gap-1.5 sm:justify-end">
                    <SourceButton
                      active={source === "upstream"}
                      icon={<Server className="size-3.5" />}
                      label="获取"
                      onClick={() => {
                        onSourceChange("upstream");
                        onRefreshUpstream?.();
                      }}
                    />
                    <SourceButton
                      active={source === "builtin"}
                      icon={<Database className="size-3.5" />}
                      label="预设"
                      onClick={() => onSourceChange("builtin")}
                    />
                  </div>
                </div>
                <fieldset className="flex flex-wrap gap-2" aria-label="模型能力筛选">
                  {capabilityFilters.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        item.key === activeCapabilityFilter
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-background/60 text-muted-foreground hover:bg-accent"
                      )}
                      onClick={() => setCapabilityFilter(item.key)}
                    >
                      <span>{item.label}</span>
                      <span className="font-mono text-[10px] opacity-70">{item.count}</span>
                    </button>
                  ))}
                </fieldset>
                {filteredModels.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    selected={model.id === value}
                    onSelect={() => onValueChange(model.id)}
                    fallbackCapability={fallbackCapability}
                  />
                ))}
                {displayedCustomModel ? (
                  <ModelRow
                    model={displayedCustomModel}
                    selected={displayedCustomModel.id === value}
                    onSelect={() => onValueChange(displayedCustomModel.id)}
                    fallbackCapability={fallbackCapability}
                  />
                ) : null}
                {!isLoading && !error && models.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    当前来源没有可选择模型。
                  </div>
                ) : null}
                {!isLoading &&
                !error &&
                models.length > 0 &&
                filteredModels.length === 0 &&
                !displayedCustomModel ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    没有匹配的模型。
                  </div>
                ) : null}
              </div>

              {error ? (
                <Alert tone="danger" className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </Alert>
              ) : null}

              {displayedModel ? null : (
                <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <Sparkles className="mr-2 inline size-4 align-[-2px]" />
                  未选择模型时，服务端会使用当前默认模型。
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border p-4">
              <Button type="button" variant="outline" onClick={() => onValueChange("")}>
                使用默认
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const CAPABILITY_LABELS: Record<LlmModelCapability, string> = {
  chat: "Chat",
  coding: "Coding",
  custom: "自定义",
  embedding: "Embedding",
  multimodal: "Multimodal",
  rerank: "Rerank",
  reasoning: "Reasoning",
  routing: "Routing",
};

function getCapabilityFilters(
  models: LlmModelOption[],
  fallbackCapability: LlmModelCapability
): Array<{
  key: LlmModelCapability | "all";
  label: string;
  count: number;
}> {
  const counts = new Map<LlmModelCapability, number>();
  for (const model of models) {
    for (const capability of getModelCapabilities(model, fallbackCapability)) {
      counts.set(capability, (counts.get(capability) ?? 0) + 1);
    }
  }

  return [
    { key: "all", label: "全部", count: models.length },
    ...Object.entries(CAPABILITY_LABELS)
      .map(([key, label]) => ({
        key: key as LlmModelCapability,
        label,
        count: counts.get(key as LlmModelCapability) ?? 0,
      }))
      .filter((item) => item.count > 0 || item.key === "custom"),
  ];
}

function filterModelsByCapability(
  models: LlmModelOption[],
  capabilityFilter: LlmModelCapability | "all",
  fallbackCapability: LlmModelCapability
): LlmModelOption[] {
  if (capabilityFilter === "all") return models;
  return models.filter((model) =>
    getModelCapabilities(model, fallbackCapability).includes(capabilityFilter)
  );
}

function filterModels(models: LlmModelOption[], filter: string): LlmModelOption[] {
  const query = filter.trim().toLowerCase();
  if (!query) return models;

  return models.filter((model) =>
    [model.name, model.id, model.provider, model.description]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query))
  );
}

function createCustomModelOption(
  models: LlmModelOption[],
  filter: string,
  source: LlmModelSource,
  fallbackCapability: LlmModelCapability
): LlmModelOption | null {
  const id = filter.trim();
  if (!id) return null;
  if (models.some((model) => model.id === id)) return null;
  return customModelOption(id, source, fallbackCapability);
}

function ModelRow({
  model,
  selected,
  onSelect,
  fallbackCapability,
}: {
  model: LlmModelOption;
  selected: boolean;
  onSelect: () => void;
  fallbackCapability: LlmModelCapability;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:bg-accent"
      )}
      onClick={onSelect}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-base font-semibold">{model.name}</span>
          {model.provider ? <ProviderBadge provider={model.provider} /> : null}
          <code className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-foreground">
            {model.id}
          </code>
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {getModelCapabilities(model, fallbackCapability).map((capability) => (
            <CapabilityBadge key={capability} capability={capability} />
          ))}
        </span>
        {model.description ? (
          <span className="mt-2 block text-sm text-muted-foreground">{model.description}</span>
        ) : null}
      </span>
      {selected ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
    </button>
  );
}

function CapabilityBadge({ capability }: { capability: LlmModelCapability }) {
  return (
    <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
      {CAPABILITY_LABELS[capability]}
    </span>
  );
}

const PROVIDER_ICONS: Record<string, string> = {
  anthropic:
    "M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z",
  google:
    "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133c-1.147 1.147-2.933 2.4-6.053 2.4c-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0C5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36c2.16-2.16 2.84-5.213 2.84-7.667c0-.76-.053-1.467-.173-2.053z",
  meta: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a7 7 0 0 0 .265.86a5.3 5.3 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927c1.497 0 2.633-.671 3.965-2.444c.76-1.012 1.144-1.626 2.663-4.32l.756-1.339l.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314c1.046.987 1.992 1.22 3.06 1.22c1.075 0 1.876-.355 2.455-.843a3.7 3.7 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745c0-2.72-.681-5.357-2.084-7.45c-1.282-1.912-2.957-2.93-4.716-2.93c-1.047 0-2.088.467-3.053 1.308c-.652.57-1.257 1.29-1.82 2.05c-.69-.875-1.335-1.547-1.958-2.056c-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999c1.132 1.748 1.647 4.195 1.647 6.4c0 1.548-.368 2.9-1.839 2.9c-.58 0-1.027-.23-1.664-1.004c-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a45 45 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327c1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446c.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338c-1.191 1.649-1.81 1.817-2.486 1.817c-.524 0-1.038-.237-1.383-.794c-.263-.426-.464-1.13-.464-2.046c0-2.221.63-4.535 1.66-6.088c.454-.687.964-1.226 1.533-1.533a2.26 2.26 0 0 1 1.088-.285",
  mistral:
    "M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z",
  openai:
    "M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z",
  openrouter:
    "M16.778 1.844v1.919q-.569-.026-1.138-.032q-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237c-2.911 2.066-2.731 1.95-4.14 2.75c-.396.223-1.342.574-2.185.798c-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799c1.41.798 1.228.683 4.14 2.75c2.126 1.509 4.22 2.11 6.148 2.236c.88.058 1.716.041 2.555.005v1.918l7.222-4.168l-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021c-1.364-.09-2.417-.357-3.979-1.465c-2.244-1.593-2.866-2.027-3.68-2.508c.889-.518 1.449-.906 3.822-2.59c1.56-1.109 2.614-1.377 3.978-1.466c.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z",
  xai: "M14.234 10.162L22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299l-.929-1.329L3.076 1.56h3.182l5.965 8.532l.929 1.329l7.754 11.09h-3.182z",
};

function ProviderBadge({ provider }: { provider: string }) {
  const icon = PROVIDER_ICONS[normalizeProvider(provider)];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
      {icon ? (
        <svg aria-hidden="true" className="size-3" fill="currentColor" viewBox="0 0 24 24">
          <path d={icon} />
        </svg>
      ) : (
        <span className="grid size-3 place-items-center rounded-[3px] bg-primary/15 text-[7px] font-semibold leading-none text-primary">
          {providerInitials(provider)}
        </span>
      )}
      <span>{provider}</span>
    </span>
  );
}

function normalizeProvider(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function providerInitials(provider: string): string {
  const initials = provider
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return initials.toUpperCase() || provider.slice(0, 2).toUpperCase();
}

function getModelCapabilities(
  model: LlmModelOption,
  fallbackCapability: LlmModelCapability
): LlmModelCapability[] {
  return model.capabilities && model.capabilities.length > 0
    ? model.capabilities
    : [fallbackCapability];
}

function customModelOption(
  id: string,
  source: LlmModelSource,
  fallbackCapability: LlmModelCapability
): LlmModelOption {
  return {
    id,
    name: "自定义模型",
    provider: "自定义",
    capabilities: fallbackCapability === "custom" ? ["custom"] : [fallbackCapability, "custom"],
    source,
    known: false,
  };
}

function SourceButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      className={cn("h-9 px-2.5 text-xs", active && "shadow-sm")}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}
