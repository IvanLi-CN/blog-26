import { useId } from "react";
import type { SearchMode, SearchReason } from "@/lib/search/settings";
import { cn } from "@/lib/utils";
export default function SearchModeControl({
  mode,
  effectiveMode,
  reason,
  onModeChange,
  disabled = false,
  isLoading = false,
}: {
  mode: SearchMode;
  effectiveMode?: SearchMode;
  reason?: SearchReason;
  onModeChange?: (mode: SearchMode) => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const descriptionId = useId();
  return (
    <div className="space-y-2">
      <fieldset className="grid grid-cols-3 gap-1" aria-describedby={descriptionId}>
        <legend className="mb-2 text-sm font-semibold">智能搜索</legend>
        {(["keyword", "rag", "rewrite"] as const).map((item) => (
          <button
            key={item}
            type="button"
            data-search-mode={item}
            aria-pressed={mode === item}
            disabled={disabled || !onModeChange}
            onClick={() => onModeChange?.(item)}
            className={cn(
              "min-h-11 rounded-lg border px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--nature-accent-strong)]",
              mode === item
                ? "border-[color:var(--nature-accent-strong)] bg-[rgba(var(--nature-accent-rgb),0.14)] text-[color:var(--nature-accent-strong)]"
                : "border-[color:var(--nature-line)] text-[color:var(--nature-text-soft)]"
            )}
          >
            {{ rag: "RAG", rewrite: "AI 改写", keyword: "关闭" }[item]}
          </button>
        ))}
      </fieldset>
      <p
        id={descriptionId}
        data-search-mode-description
        className="text-xs leading-5 text-[color:var(--nature-text-soft)]"
      >
        {
          {
            rag: "先返回全文命中，再由 AI 补充语义相关内容。",
            rewrite: "先返回全文命中，再由 AI 改写查询补充结果。",
            keyword: "关闭智能搜索，仅使用快速全文检索。",
          }[mode]
        }
      </p>
      {!isLoading && effectiveMode === "keyword" && mode !== "keyword" && (
        <p
          role="status"
          data-search-fallback
          className="text-xs leading-5 text-[color:var(--nature-text-soft)]"
        >
          已使用原始关键词搜索。
          {reason === "explicit-query"
            ? "此查询使用精确检索语法。"
            : {
                disabled: "AI 检索已停用。",
                unconfigured: "AI 模型尚未配置。",
                unvalidated: "AI 检索尚未通过质量验证。",
                timeout: "AI 检索超时。",
                "invalid-output": "AI 返回的结果未通过校验。",
                "budget-exceeded": "已达到检索资源预算。",
                unavailable: "AI 检索暂不可用。",
              }[reason ?? "unavailable"]}
        </p>
      )}
    </div>
  );
}
