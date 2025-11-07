"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TagGroup } from "@/types/tag-groups";
import type { TagSummary } from "@/types/tags";

const MODEL_HISTORY_KEY = "tag-ai-model-history";
const DRAFT_HISTORY_KEY = "tag-ai-drafts";
const MAX_DRAFTS = 10;

function generateDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface Props {
  initialGroups: TagGroup[];
  tagSummaries: TagSummary[];
  initialModel?: string;
}

interface AiResultState {
  id?: string;
  createdAt?: number;
  groups: TagGroup[];
  notes?: string;
  model?: string;
  summaryTitle?: string;
}

interface HoverState {
  draft: AiResultState;
  rect: DOMRect;
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

function deriveDraftTitle(draft: AiResultState): string {
  if (draft.summaryTitle && draft.summaryTitle.trim().length > 0) {
    return draft.summaryTitle.trim();
  }
  if (draft.notes && draft.notes.trim().length > 0) {
    return draft.notes.trim().slice(0, 60);
  }
  const joined = draft.groups
    .map((group) => group.title?.trim())
    .filter((title): title is string => Boolean(title))
    .slice(0, 3)
    .join(" / ");
  return joined || "未命名草稿";
}

function formatDraftTime(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function buildDraftTooltip(draft: AiResultState): string {
  const summaryPart = draft.summaryTitle ? `摘要：${draft.summaryTitle}` : "";
  const notesPart = draft.notes ? `说明：${draft.notes}` : "";
  const modelPart = draft.model ? `模型：${draft.model}` : "";
  return [summaryPart, notesPart, modelPart].filter((segment) => segment.length > 0).join("\n");
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
  const [drafts, setDrafts] = useState<AiResultState[]>([]);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
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
    try {
      const rawDrafts = window.localStorage.getItem(DRAFT_HISTORY_KEY);
      if (rawDrafts) {
        const parsed = JSON.parse(rawDrafts);
        if (Array.isArray(parsed)) {
          const validDrafts = parsed
            .filter(
              (item): item is AiResultState =>
                typeof item === "object" && item !== null && Array.isArray(item.groups)
            )
            .map((item) => ({
              ...item,
              id: item.id || generateDraftId(),
              createdAt: item.createdAt ?? Date.now(),
            }))
            .slice(0, MAX_DRAFTS);
          setDrafts(validDrafts);
        }
      }
    } catch {
      setDrafts([]);
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

  const persistDrafts = useCallback((nextDrafts: AiResultState[]) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DRAFT_HISTORY_KEY, JSON.stringify(nextDrafts));
    } catch {
      // ignore
    }
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
      const timestamp = Date.now();
      const enriched: AiResultState = {
        ...data,
        id: data.id || generateDraftId(),
        createdAt: data.createdAt ?? timestamp,
      };
      setAiState(enriched);
      setWorkingGroups(enriched.groups);
      setDrafts((prev) => {
        const next = [enriched, ...prev.filter((draft) => draft.id !== enriched.id)].slice(
          0,
          MAX_DRAFTS
        );
        persistDrafts(next);
        return next;
      });
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

  const removeDraft = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      setDrafts((prev) => {
        const next = prev.filter((draft) => draft.id !== id);
        persistDrafts(next);
        return next;
      });
    },
    [persistDrafts]
  );

  const loadDraft = useCallback(
    (draft: AiResultState) => {
      setWorkingGroups(draft.groups);
      setAiState(draft);
      if (draft.model) {
        setModel(draft.model);
        rememberModel(draft.model);
      }
      setStatus("已载入草稿");
      setError(null);
    },
    [rememberModel]
  );

  const clearDrafts = useCallback(() => {
    setDrafts([]);
    persistDrafts([]);
  }, [persistDrafts]);

  const updateHoverState = useCallback((draft: AiResultState, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setHoverState({ draft, rect });
  }, []);

  const clearHoverState = useCallback(() => {
    setHoverState(null);
  }, []);

  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(workingGroups) !== JSON.stringify(baselineGroups);
  }, [workingGroups, baselineGroups]);

  const activeDraftId = aiState?.id;

  const hoverCardMeta = useMemo(() => {
    if (!hoverState || typeof window === "undefined") return null;
    const tooltip = buildDraftTooltip(hoverState.draft);
    if (!tooltip) return null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = 280;
    const cardHeight = 160;
    const baseTop = hoverState.rect.top;
    const top = Math.min(Math.max(16, baseTop), viewportHeight - cardHeight - 16);
    const baseLeft = hoverState.rect.right + 12;
    const left = Math.min(baseLeft, viewportWidth - cardWidth - 16);
    const lines = tooltip.split("\n").filter((line) => line.length > 0);
    return { top, left, lines };
  }, [hoverState]);

  return (
    <>
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
          <div className="flex h-full flex-col space-y-3 rounded-lg border border-base-content/10 bg-base-200/40 p-4">
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
                覆盖情况：{coverage.assignedCount}/{coverage.total}（缺失 {coverage.missing.length}
                ）
              </p>
              {coverage.duplicates.length > 0 && (
                <p className="text-error">重复：{coverage.duplicates.join(", ")}</p>
              )}
              {coverage.missing.length > 0 && (
                <p className="text-warning">未分组：{coverage.missing.join(", ")}</p>
              )}
            </div>

            <div className="mt-3 flex flex-1 flex-col">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-base-content/60">
                <span>草稿历史</span>
                {drafts.length > 0 && (
                  <button
                    className="btn btn-ghost btn-xs text-xs"
                    type="button"
                    onClick={clearDrafts}
                  >
                    清空
                  </button>
                )}
              </div>
              <div className="mt-2 flex-1 space-y-2 overflow-y-auto overflow-x-visible pr-1">
                {drafts.length === 0 ? (
                  <p className="text-xs text-base-content/50">暂无草稿，生成后会自动保存喵。</p>
                ) : (
                  drafts.map((draft) => {
                    const title = deriveDraftTitle(draft);
                    const time = formatDraftTime(draft.createdAt);
                    const isActive = activeDraftId && draft.id === activeDraftId;
                    return (
                      <div
                        key={draft.id ?? `${title}-${draft.createdAt}`}
                        className={`flex items-start gap-2 rounded-lg border p-2 transition ${
                          isActive
                            ? "border-primary bg-primary/10"
                            : "border-base-content/10 bg-base-100/80"
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => loadDraft(draft)}
                          onFocus={(event) => updateHoverState(draft, event.currentTarget)}
                          onBlur={clearHoverState}
                          onMouseEnter={(event) =>
                            updateHoverState(
                              draft,
                              event.currentTarget.closest("div") ?? event.currentTarget
                            )
                          }
                          onMouseMove={(event) =>
                            updateHoverState(
                              draft,
                              event.currentTarget.closest("div") ?? event.currentTarget
                            )
                          }
                          onMouseLeave={clearHoverState}
                        >
                          <p className="text-sm font-medium text-base-content">{title}</p>
                          <p className="mt-1 text-xs text-base-content/50">
                            {draft.model ? `模型 ${draft.model}` : "默认模型"}
                            {time ? ` · ${time}` : ""}
                          </p>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => removeDraft(draft.id)}
                          aria-label="删除草稿"
                          onMouseEnter={(event) =>
                            updateHoverState(
                              draft,
                              event.currentTarget.closest("div") ?? event.currentTarget
                            )
                          }
                          onMouseMove={(event) =>
                            updateHoverState(
                              draft,
                              event.currentTarget.closest("div") ?? event.currentTarget
                            )
                          }
                          onMouseLeave={clearHoverState}
                        >
                          删除
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
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
      {hoverCardMeta &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-[280px] text-xs"
            style={{ top: hoverCardMeta.top, left: hoverCardMeta.left }}
          >
            <div className="rounded-xl border border-base-content/10 bg-base-100/90 p-3 shadow-lg backdrop-blur">
              {hoverCardMeta.lines.map((line) => (
                <p key={line} className="text-base-content/80">
                  {line}
                </p>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
