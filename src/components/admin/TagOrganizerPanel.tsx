"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { TagGroup } from "@/types/tag-groups";
import type { TagSummary } from "@/types/tags";

const MODEL_HISTORY_KEY = "tag-ai-model-history";

interface Props {
  initialGroups: TagGroup[];
  tagSummaries: TagSummary[];
  initialModel?: string;
}

interface AiResultState {
  groups: TagGroup[];
  notes?: string;
  model?: string;
}

function normalizeTargetCount(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input <= 0) return fallback;
  return Math.min(20, Math.max(2, Math.round(input)));
}

function summarizeCoverage(groups: TagGroup[], tagSummaries: TagSummary[]) {
  const all = new Set(tagSummaries.map((t) => t.name));
  const assigned = new Set<string>();
  const duplicates: string[] = [];
  for (const group of groups) {
    for (const tag of group.tags) {
      if (!all.has(tag)) continue;
      if (assigned.has(tag)) {
        duplicates.push(tag);
      } else {
        assigned.add(tag);
      }
    }
  }
  const missing = Array.from(all).filter((tag) => !assigned.has(tag));
  return { missing, duplicates, assignedCount: assigned.size, total: all.size };
}

export default function TagOrganizerPanel({ initialGroups, tagSummaries, initialModel }: Props) {
  const [targetCount, setTargetCount] = useState(() =>
    normalizeTargetCount(initialGroups.length || 8, 8)
  );
  const [aiState, setAiState] = useState<AiResultState | null>(null);
  const [baselineGroups, setBaselineGroups] = useState<TagGroup[]>(() => initialGroups);
  const [workingGroups, setWorkingGroups] = useState<TagGroup[]>(() => initialGroups);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [model, setModel] = useState("");
  const [modelHistory, setModelHistory] = useState<string[]>([]);
  const initRef = useRef(false);
  const modelListId = useId();

  useEffect(() => {
    setBaselineGroups(initialGroups);
    setWorkingGroups(initialGroups);
  }, [initialGroups]);

  const coverage = useMemo(
    () => summarizeCoverage(workingGroups, tagSummaries),
    [workingGroups, tagSummaries]
  );

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (typeof window === "undefined") return;
    let items: string[] = [];
    try {
      const raw = window.localStorage.getItem(MODEL_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          items = parsed.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0
          );
        }
      }
    } catch {
      // ignore parse errors
    }
    const normalizedInitial = initialModel?.trim();
    if (normalizedInitial) {
      items = [normalizedInitial, ...items.filter((item) => item !== normalizedInitial)];
    }
    const finalItems = items.slice(0, 5);
    setModelHistory(finalItems);
    const defaultModel = finalItems[0] ?? "";
    setModel(defaultModel);
    try {
      window.localStorage.setItem(MODEL_HISTORY_KEY, JSON.stringify(finalItems));
    } catch {
      // ignore storage errors
    }
  }, [initialModel]);

  const rememberModel = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setModelHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 5);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(MODEL_HISTORY_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
      }
      return next;
    });
  }, []);

  async function runAiOrganize(persist = false) {
    setIsRunning(true);
    setError(null);
    setStatus("生成中……");
    try {
      const trimmedModel = model.trim();
      const payload: Record<string, unknown> = { targetGroups: targetCount };
      if (persist) payload.persist = true;
      if (trimmedModel) payload.model = trimmedModel;
      const response = await fetch("/api/tags/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "AI 整理失败");
      }
      const result = (await response.json()) as { data?: AiResultState };
      const data = result.data as AiResultState | undefined;
      if (!data?.groups) {
        throw new Error("AI 返回内容缺失");
      }
      if (trimmedModel) {
        rememberModel(trimmedModel);
      }
      setAiState(data);
      setWorkingGroups(data.groups);
      if (persist) {
        setBaselineGroups(data.groups);
        setStatus("已生成并保存");
      } else {
        setStatus("已生成草稿，尚未保存");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 整理失败");
      setStatus(null);
    } finally {
      setIsRunning(false);
    }
  }

  async function saveGroups() {
    setIsSaving(true);
    setError(null);
    setStatus("保存中……");
    try {
      const response = await fetch("/api/tags/organize", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: workingGroups }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "保存失败");
      }
      rememberModel(model);
      setBaselineGroups(workingGroups);
      setStatus("保存成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setStatus(null);
    } finally {
      setIsSaving(false);
    }
  }

  function resetToCurrent() {
    setWorkingGroups(baselineGroups);
    setAiState(null);
    setStatus("已回退");
    setError(null);
  }

  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(workingGroups) !== JSON.stringify(baselineGroups);
  }, [workingGroups, baselineGroups]);

  return (
    <section className="rounded-xl border border-base-content/10 bg-base-100/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-base-content">AI 标签分组助手</h2>
        {status && <span className="badge badge-success badge-sm">{status}</span>}
        {error && <span className="badge badge-error badge-sm">{error}</span>}
      </div>

      <p className="mt-3 text-sm text-base-content/60">
        自动根据标签语义生成均衡的分类。确认无误后可以覆盖当前配置。
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
        <div className="space-y-3 rounded-lg border border-base-content/10 bg-base-200/40 p-4">
          <label className="flex flex-col gap-2 text-sm text-base-content">
            目标分类数量
            <input
              type="number"
              className="input input-sm input-bordered"
              min={2}
              max={20}
              value={targetCount}
              onChange={(event) =>
                setTargetCount(normalizeTargetCount(Number(event.target.value), targetCount))
              }
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-base-content">
            模型名称
            <input
              type="text"
              list={modelListId}
              className="input input-sm input-bordered"
              placeholder="例如 glm-4.5"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <datalist id={modelListId}>
              {modelHistory.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => runAiOrganize(false)}
              disabled={isRunning}
              type="button"
            >
              {isRunning ? "生成中…" : "生成草稿"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => runAiOrganize(true)}
              disabled={isRunning}
              type="button"
            >
              {isRunning ? "处理中…" : "生成并保存"}
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={saveGroups}
              disabled={isSaving || !hasPendingChanges}
              type="button"
            >
              {isSaving ? "保存中…" : "保存草稿"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={resetToCurrent}
              disabled={isRunning}
              type="button"
            >
              重置
            </button>
          </div>

          <div className="text-xs text-base-content/60">
            <p>
              覆盖情况：{coverage.assignedCount}/{coverage.total}（缺失 {coverage.missing.length}）
            </p>
            {coverage.duplicates.length > 0 && (
              <p className="text-error">重复：{coverage.duplicates.join(", ")}</p>
            )}
            {coverage.missing.length > 0 && (
              <p className="text-warning">未分组：{coverage.missing.join(", ")}</p>
            )}
            {aiState?.notes && (
              <p className="mt-2 text-base-content/70">AI Notes: {aiState.notes}</p>
            )}
            {aiState?.model && <p className="text-base-content/50">Model: {aiState.model}</p>}
          </div>
        </div>

        <div className="space-y-4">
          {workingGroups.map((group) => (
            <div
              key={group.key}
              className="rounded-lg border border-base-content/10 bg-base-100 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-base-content">{group.title}</h3>
                <span className="text-xs text-base-content/50">{group.tags.length}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-xs text-base-content/70">
                {group.tags.map((tag) => (
                  <span key={tag} className="badge badge-ghost">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
