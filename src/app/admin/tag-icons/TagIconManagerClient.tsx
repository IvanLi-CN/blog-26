"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import Icon from "@/components/ui/Icon";
import ToastAlert from "@/components/ui/ToastAlert";

type SuggestResponse = {
  type: "tag" | "category";
  name?: string;
  key?: string;
  candidates: { id: string }[];
  ai?: { icon: string | null; confidence: number; reason: string };
};

type Item = {
  kind: "tag" | "category";
  id: string; // tag name or category key
  title: string; // display title
  currentIcon: string | null;
  count?: number; // posts count for tag
};

type BulkEntryStatus = "success" | "skipped" | "error";

type BulkEntry = {
  kind: "tag" | "category";
  id: string;
  title: string;
  status: BulkEntryStatus;
  detail: string;
};

function IconChoice({
  icon,
  selected,
  onClick,
}: {
  icon: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative group/icon inline-flex">
      <button
        type="button"
        className={`inline-flex items-center justify-center rounded-md border p-2 transition ${
          selected
            ? "border-primary ring-1 ring-primary/60"
            : "border-base-content/20 hover:border-primary/60"
        }`}
        onClick={onClick}
        aria-label={`choose ${icon}`}
        title={icon}
      >
        <Icon name={icon} className="w-6 h-6" />
      </button>
      <span
        className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-base-200 px-2 py-1 text-xs text-base-content shadow opacity-0 group-hover/icon:opacity-100 group-focus-within/icon:opacity-100"
        role="tooltip"
      >
        {icon}
      </span>
    </div>
  );
}

export default function TagIconManagerClient({
  groups,
  iconsMap,
  categoryIcons,
}: {
  groups: Array<{
    key: string;
    title: string;
    tags: Array<{ name: string; lastSegment: string; count: number }>;
  }>;
  iconsMap: Record<string, string | null>;
  categoryIcons: Record<string, string | null>;
}) {
  // Load extended icon sets only for this admin tool to avoid bloating the public bundle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { addCollection } = await import("@iconify/react");
        const sets = await Promise.allSettled([
          import("@iconify-json/simple-icons/icons.json"),
          import("@iconify-json/carbon/icons.json"),
          import("@iconify-json/bxl/icons.json"),
          import("@iconify-json/cib/icons.json"),
          import("@iconify-json/fa6-brands/icons.json"),
          import("@iconify-json/material-symbols/icons.json"),
          import("@iconify-json/game-icons/icons.json"),
        ]);
        if (cancelled) return;
        for (const s of sets) {
          if (s.status === "fulfilled") {
            try {
              // @ts-expect-error runtime json module default
              addCollection(s.value.default);
            } catch {
              // ignore duplicate registration or optional packages
            }
          }
        }
      } catch {
        // ignore load errors; base sets (tabler, line-md) still work
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [suggestion, setSuggestion] = useState<Record<string, SuggestResponse>>({});
  const [tagIcons, setTagIcons] = useState<Record<string, string | null>>(() => ({ ...iconsMap }));
  const [catIcons, setCatIcons] = useState<Record<string, string | null>>(() => ({
    ...categoryIcons,
  }));
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
  const inFlightRef = useRef<Set<string>>(new Set());

  const keyOf = (kind: "tag" | "category", id: string) => `${kind}:${id}`;

  const toggle = (id: string, kind?: "tag" | "category", title?: string) => {
    setOpen((p) => {
      const k = kind ? keyOf(kind, id) : id;
      const next = { ...p, [k]: !p[k] };
      // 仅首次打开自动生成；已生成过则不重复请求
      if (next[k] && kind && !suggestion[k]) generate(kind, id, title);
      return next;
    });
  };

  async function generate(
    kind: "tag" | "category",
    id: string,
    title?: string
  ): Promise<SuggestResponse | null> {
    const k = keyOf(kind, id);
    if (inFlightRef.current.has(k)) return null; // 避免重复请求
    inFlightRef.current.add(k);
    setLoading((p) => ({ ...p, [k]: true }));
    try {
      const res = await fetch("/api/admin/tag-icons/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "tag" ? { type: "tag", name: id } : { type: "category", key: id, title }
        ),
      });
      const data = (await res.json()) as SuggestResponse;
      // 合并历史候选与新候选（去重）
      setSuggestion((p) => {
        const prev = p[k];
        const mergedSet = new Set<string>([
          ...(prev?.candidates || []).map((x) => x.id),
          ...(data.candidates || []).map((x) => x.id),
        ]);
        const merged = Array.from(mergedSet).map((i) => ({ id: i }));
        return { ...p, [k]: { ...(data || {}), candidates: merged } };
      });
      return data;
    } catch (e) {
      console.error("suggest failed", e);
      return null;
    } finally {
      setLoading((p) => ({ ...p, [k]: false }));
      inFlightRef.current.delete(k);
    }
  }

  async function assign(
    kind: "tag" | "category",
    id: string,
    icon: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/tag-icons/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "tag" ? { type: "tag", name: id, icon } : { type: "category", key: id, icon }
        ),
      });
      if (!res.ok) {
        const msg = await res
          .json()
          .then((x) => x?.error || "保存失败")
          .catch(() => "保存失败");
        toast.error(<ToastAlert type="error" message={msg} />);
        return { ok: false, error: msg };
      }
      // 后端已持久化成功，再更新本地状态
      const next = icon || null;
      if (kind === "tag") setTagIcons((m) => ({ ...m, [id]: next }));
      else setCatIcons((m) => ({ ...m, [id]: next }));
      return { ok: true };
    } catch (_e) {
      toast.error(<ToastAlert type="error" message="网络错误，请稍后重试" />);
      return { ok: false, error: "网络错误，请稍后重试" };
    }
  }

  async function handleBulkAssign() {
    if (bulkAssigning) return;

    // 仅针对“未配图标”的标签与分类执行自动分配
    const targets: Array<{ kind: "tag" | "category"; id: string; title: string }> = [];
    for (const g of groups) {
      if (!catIcons[g.key]) {
        targets.push({ kind: "category", id: g.key, title: g.title });
      }
      for (const t of g.tags) {
        if (!tagIcons[t.name]) {
          targets.push({ kind: "tag", id: t.name, title: t.lastSegment });
        }
      }
    }

    if (targets.length === 0) {
      toast.info(<ToastAlert type="info" message="当前没有未配图标的标签或分类~" />);
      return;
    }

    setBulkDialogOpen(true);
    setBulkTotal(targets.length);
    setBulkDone(0);
    setBulkEntries([]);
    setBulkAssigning(true);
    let successCount = 0;
    let skippedNoCandidate = 0;
    let llmErrorCount = 0;

    try {
      const total = targets.length;
      for (let index = 0; index < total; index += 1) {
        const t = targets[index];
        const k = keyOf(t.kind, t.id);
        let entry: BulkEntry = {
          kind: t.kind,
          id: t.id,
          title: t.title,
          status: "error",
          detail: "",
        };
        try {
          // 若已有候选，则直接使用；否则先生成候选
          let sug = suggestion[k];
          if (!sug) {
            sug = (await generate(t.kind, t.id, t.title)) || undefined;
          }
          const aiIcon = sug?.ai?.icon;
          if (!aiIcon) {
            const reason = sug?.ai?.reason || "";
            // 将后端返回的 reason 直接展示给用户，便于排查，例如 LLM 网关 503 文案
            if (
              reason === "llm_error" ||
              reason === "llm_unavailable" ||
              /llm/i.test(reason) ||
              /分组 .* 无可用渠道/.test(reason)
            ) {
              llmErrorCount += 1;
              entry = {
                ...entry,
                status: "error",
                detail: reason || "AI 服务错误（未返回详细信息）",
              };
            } else {
              skippedNoCandidate += 1;
              entry = {
                ...entry,
                status: "skipped",
                detail: reason || "AI 未返回任何候选图标",
              };
            }
          } else {
            const result = await assign(t.kind, t.id, aiIcon);
            if (result.ok) {
              successCount += 1;
              entry = {
                ...entry,
                status: "success",
                detail: `已应用图标：${aiIcon}`,
              };
            } else {
              entry = {
                ...entry,
                status: "error",
                detail: result.error || "保存图标失败",
              };
            }
          }
        } catch (e) {
          console.error("bulk assign failed for", t, e);
          entry = {
            ...entry,
            status: "error",
            detail: e instanceof Error ? e.message : "未知错误",
          };
        }

        setBulkEntries((prev) => [...prev, entry]);
        setBulkDone(index + 1);
      }

      if (successCount > 0) {
        toast.success(
          <ToastAlert
            type="success"
            message={`已为 ${successCount} 个项自动分配图标${
              skippedNoCandidate ? `，${skippedNoCandidate} 个项未找到合适候选` : ""
            }${llmErrorCount ? `，${llmErrorCount} 个项因 AI 服务错误被跳过` : ""}`}
          />
        );
      } else if (llmErrorCount > 0) {
        toast.error(
          <ToastAlert
            type="error"
            message="AI 图标服务当前不可用，无法完成一键分配，请稍后重试或检查模型配置。"
          />
        );
      } else {
        toast.info(
          <ToastAlert type="info" message="暂未找到可自动分配的图标候选（AI 返回为空）~" />
        );
      }
    } finally {
      setBulkAssigning(false);
    }
  }

  function Panel({ item }: { item: Item }) {
    const k = keyOf(item.kind, item.id);
    const sug = suggestion[k];
    const current = item.kind === "tag" ? tagIcons[item.id] : catIcons[item.id];
    const aiPick = sug?.ai?.icon || null;

    return (
      <div className="mt-2 p-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-base-content/60">当前</span>
            <div className="relative group/icon inline-flex">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-base-content/20 p-1"
                title={current || (item.kind === "tag" ? "tabler:hash" : "tabler:category")}
                aria-label={current || (item.kind === "tag" ? "tabler:hash" : "tabler:category")}
              >
                <Icon
                  name={current || (item.kind === "tag" ? "tabler:hash" : "tabler:category")}
                  className="w-5 h-5"
                />
              </button>
              <span
                className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-base-200 px-2 py-1 text-xs text-base-content shadow opacity-0 group-hover/icon:opacity-100 group-focus-within/icon:opacity-100"
                role="tooltip"
              >
                {current || (item.kind === "tag" ? "tabler:hash" : "tabler:category")}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => generate(item.kind, item.id, item.title)}
            aria-label="refresh"
            title="刷新"
            disabled={loading[k]}
          >
            <Icon
              name={loading[k] ? "tabler:loader-2" : "tabler:refresh"}
              className={`w-4 h-4 ${loading[k] ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => assign(item.kind, item.id, "")}
            aria-label="clear"
            title="清除图标（恢复默认）"
          >
            <Icon name="tabler:backspace" className="w-4 h-4" />
          </button>
        </div>
        {sug && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {aiPick ? (
                <IconChoice icon={aiPick} onClick={() => assign(item.kind, item.id, aiPick)} />
              ) : null}
              {(sug.candidates || [])
                .filter((c) => c.id !== aiPick)
                .map((c) => (
                  <IconChoice
                    key={c.id}
                    icon={c.id}
                    onClick={() => assign(item.kind, item.id, c.id)}
                  />
                ))}
            </div>
            {!aiPick && (sug.candidates || []).length === 0 && (
              <div className="mt-3 rounded border border-dashed border-base-content/20 bg-base-100/40 p-3 text-xs text-base-content/70">
                <div>暂无可用候选。请点击右上角“刷新”重试。</div>
                {sug.ai?.reason && (
                  <div className="mt-1 text-base-content/50">原因：{sug.ai.reason}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {bulkDialogOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Icon name="lucide:sparkles" className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-base-content">一键分配图标 - 批量任务</h3>
                <p className="text-sm text-base-content/70">
                  正在为未配图标的标签和分类生成候选并自动应用图标，下面展示实时进度与错误详情。
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm text-base-content/70 mb-1">
                  <span>
                    进度：{bulkDone} / {bulkTotal}
                  </span>
                  <span>{bulkTotal > 0 ? Math.round((bulkDone / bulkTotal) * 100) : 0}%</span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={bulkDone}
                  max={bulkTotal || 1}
                />
              </div>

              {bulkEntries.length > 0 && (
                <div className="border border-base-200 rounded-md max-h-64 overflow-auto text-xs">
                  <table className="table table-zebra-zebra table-xs w-full">
                    <thead>
                      <tr>
                        <th className="w-24">类型</th>
                        <th className="w-48">名称</th>
                        <th className="w-20">状态</th>
                        <th>详情</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkEntries.map((e) => (
                        <tr key={`${e.kind}:${e.id}`}>
                          <td>{e.kind === "tag" ? "标签" : "分类"}</td>
                          <td className="truncate" title={e.title || e.id}>
                            {e.title || e.id}
                          </td>
                          <td>
                            {e.status === "success" ? (
                              <span className="text-success">成功</span>
                            ) : e.status === "skipped" ? (
                              <span className="text-base-content/70">跳过</span>
                            ) : (
                              <span className="text-error">错误</span>
                            )}
                          </td>
                          <td className="whitespace-pre-wrap break-all">{e.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!bulkAssigning && bulkEntries.length === 0 && (
                <div className="alert alert-info py-2 px-3 text-xs">
                  <span>尚未开始或没有可执行的一键分配任务。</span>
                </div>
              )}
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setBulkDialogOpen(false);
                  setBulkEntries([]);
                  setBulkTotal(0);
                  setBulkDone(0);
                }}
                disabled={bulkAssigning}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="tabs tabs-bordered">
            <button
              type="button"
              className={`tab ${filter === "all" ? "tab-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              全部
            </button>
            <button
              type="button"
              className={`tab ${filter === "missing" ? "tab-active" : ""}`}
              onClick={() => setFilter("missing")}
            >
              未配图标
            </button>
          </div>

          <button
            type="button"
            className={`btn btn-sm btn-primary ${bulkAssigning ? "loading" : ""}`}
            onClick={handleBulkAssign}
            disabled={bulkAssigning}
          >
            <Icon name="lucide:sparkles" className="w-4 h-4 mr-1" />
            {bulkAssigning ? "自动分配中..." : "一键分配"}
          </button>
        </div>

        {groups
          .map((g) => {
            if (filter === "all") return g;
            const categoryMissing = !catIcons[g.key];
            const missingTags = g.tags.filter((t) => !tagIcons[t.name]);
            if (!categoryMissing && missingTags.length === 0) return null;
            return { ...g, tags: missingTags };
          })
          .filter((g): g is (typeof groups)[number] => Boolean(g))
          .map((g) => {
            const catItem: Item = {
              kind: "category",
              id: g.key,
              title: g.title,
              currentIcon: catIcons[g.key] || null,
            };
            const catKey = keyOf("category", catItem.id);
            return (
              <section key={g.key} className="space-y-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-base-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={() => toggle(catItem.id, "category", catItem.title)}
                  aria-expanded={Boolean(open[catKey])}
                >
                  <span className="flex items-center gap-2">
                    <Icon
                      name={(catIcons[g.key] || catItem.currentIcon || "tabler:category") as string}
                      className="w-5 h-5 text-primary/80"
                    />
                    <h3 className="text-lg font-semibold">{g.title}</h3>
                  </span>
                  <span className="text-base-content/70" aria-hidden="true">
                    <Icon
                      name={
                        loading[catKey]
                          ? "tabler:loader-2"
                          : open[catKey]
                            ? "tabler:chevron-down"
                            : "tabler:chevron-right"
                      }
                      className={`w-4 h-4 ${loading[catKey] ? "animate-spin" : ""}`}
                    />
                  </span>
                </button>
                {open[catKey] && (
                  <Panel item={{ ...catItem, currentIcon: catIcons[g.key] || null }} />
                )}
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {g.tags.map((t) => {
                    const id = t.name;
                    const item: Item = {
                      kind: "tag",
                      id,
                      title: t.lastSegment,
                      currentIcon: tagIcons[id] || null,
                      count: t.count,
                    };
                    return (
                      <div
                        key={id}
                        className="group/card rounded-lg border border-base-content/10 bg-base-100/60 p-3 transition hover:border-primary/60 hover:bg-base-100 shadow-sm"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          onClick={() => toggle(id, "tag", item.title)}
                          aria-expanded={Boolean(open[keyOf("tag", id)])}
                        >
                          <span className="flex items-center gap-2">
                            <Icon name={item.currentIcon || "tabler:hash"} className="w-4 h-4" />
                            <span className="font-medium">{item.title}</span>
                          </span>
                          <span className="text-base-content/70" aria-hidden="true">
                            <Icon
                              name={
                                loading[keyOf("tag", id)]
                                  ? "tabler:loader-2"
                                  : open[keyOf("tag", id)]
                                    ? "tabler:chevron-down"
                                    : "tabler:chevron-right"
                              }
                              className={`w-4 h-4 ${loading[keyOf("tag", id)] ? "animate-spin" : ""}`}
                            />
                          </span>
                        </button>
                        {open[keyOf("tag", id)] && <Panel item={item} />}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </>
  );
}
