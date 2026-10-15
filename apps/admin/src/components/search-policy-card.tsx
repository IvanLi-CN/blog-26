import { BrainCircuit, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import {
  type AiSearchMode,
  DEFAULT_SEARCH_POLICY,
  type SearchPolicy,
  type SearchQuality,
  type SearchReason,
} from "@/lib/search/settings";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Disclosure,
  FieldLabel,
  Input,
  Switch,
} from "~/components/ui";

const labels: Record<AiSearchMode, string> = { rag: "AI 检索（RAG）", rewrite: "AI 改写" };
const icons = { rag: BrainCircuit, rewrite: WandSparkles } as const;
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

export function SearchPolicyCard({
  mode,
  policy,
  status,
  quality,
  dirty,
  validating,
  onChange,
  onChooseModel,
  onValidate,
  validationStatus,
}: {
  mode: AiSearchMode;
  policy: SearchPolicy[AiSearchMode];
  status: { available: boolean; reason?: SearchReason };
  quality?: SearchQuality;
  dirty: boolean;
  validating: boolean;
  onChange: (values: Partial<SearchPolicy[AiSearchMode]>) => void;
  onChooseModel: (trigger: HTMLElement) => void;
  onValidate: () => void;
  validationStatus?: ReactNode;
}) {
  const ModeIcon = icons[mode];
  const numeric =
    mode === "rag"
      ? [
          ["candidateLimit", "判断窗口", 1, 50],
          ["contentCodePoints", "每条内容字符上限", 128, 4096],
        ]
      : [["maxQueries", "改写表达数", 1, 3]];
  const fields = [
    ["timeoutMs", "请求超时（毫秒）", 100, 30000],
    ["maxInputTokens", "输入 Token 预算", 256, 32768],
    ["maxOutputTokens", "输出 Token 预算", 128, 4096],
    ...numeric,
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ModeIcon className="size-5 text-primary" aria-hidden="true" />
          {labels[mode]}
        </CardTitle>
        <CardDescription>
          {mode === "rag"
            ? "读取检索候选，判断相关性并排序。"
            : "只改写查询，再调用全文搜索；模型不读取站内内容。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>启用此模式</FieldLabel>
          <Switch
            aria-label={`启用${labels[mode]}`}
            checked={policy.enabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>继承对话模型</FieldLabel>
          <Switch
            aria-label={`${labels[mode]}继承对话模型`}
            checked={policy.model === null}
            onCheckedChange={(inherit) => onChange({ model: inherit ? null : "" })}
          />
        </div>
        {policy.model !== null ? (
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-0 flex-1"
              aria-label={`${labels[mode]}模型 ID`}
              value={policy.model}
              onChange={(event) => onChange({ model: event.target.value })}
            />
            <Button variant="outline" onClick={(event) => onChooseModel(event.currentTarget)}>
              选择模型
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">端点与 API Key 使用现有对话提供方配置。</p>
        <Disclosure
          summary="高级预算设置"
          summaryClassName="py-2 text-sm font-medium text-foreground"
        >
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label, min, max]) => (
              <label key={key} htmlFor={`search-${mode}-${key}`} className="space-y-1 text-sm">
                <span>{label}</span>
                <Input
                  id={`search-${mode}-${key}`}
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  aria-label={`${labels[mode]}${label}`}
                  value={Reflect.get(policy, key)}
                  onChange={(event) => onChange({ [key]: Number(event.target.value) })}
                />
                <span className="text-xs text-muted-foreground">
                  {min}–{max}
                </span>
              </label>
            ))}
          </div>
          <Button variant="ghost" onClick={() => onChange(DEFAULT_SEARCH_POLICY[mode])}>
            恢复此模式默认值
          </Button>
        </Disclosure>
        <div className="rounded-xl bg-muted/40 p-3 text-sm" role="status">
          {status.available
            ? "当前配置已通过质量验证，可用于搜索。"
            : `使用关键词回退：${reasons[status.reason ?? "unvalidated"]}`}{" "}
          {quality ? (
            <span className="block mt-1 text-xs text-muted-foreground">
              上次验证：{new Date(quality.validatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
        <Button
          variant="outline"
          disabled={dirty || !policy.enabled || validating}
          onClick={onValidate}
        >
          验证已保存配置
        </Button>
        {dirty ? (
          <p className="text-xs text-muted-foreground">
            先保存搜索设置和对话模型配置，再运行验证。
          </p>
        ) : null}
        {validationStatus}
      </CardContent>
    </Card>
  );
}
