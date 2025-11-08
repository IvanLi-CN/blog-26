"use client";

import { useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

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
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [suggestion, setSuggestion] = useState<Record<string, SuggestResponse>>({});
  const [tagIcons, setTagIcons] = useState<Record<string, string | null>>(() => ({ ...iconsMap }));
  const [catIcons, setCatIcons] = useState<Record<string, string | null>>(() => ({
    ...categoryIcons,
  }));
  const inFlightRef = useRef<Set<string>>(new Set());

  const toggle = (id: string, kind?: "tag" | "category", title?: string) => {
    setOpen((p) => {
      const next = { ...p, [id]: !p[id] };
      // 仅首次打开自动生成；已生成过则不重复请求
      if (next[id] && kind && !suggestion[id]) generate(kind, id, title);
      return next;
    });
  };

  async function generate(kind: "tag" | "category", id: string, title?: string) {
    if (inFlightRef.current.has(id)) return; // 避免重复请求
    inFlightRef.current.add(id);
    setLoading((p) => ({ ...p, [id]: true }));
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
        const prev = p[id];
        const mergedSet = new Set<string>([
          ...(prev?.candidates || []).map((x) => x.id),
          ...(data.candidates || []).map((x) => x.id),
        ]);
        const merged = Array.from(mergedSet).map((i) => ({ id: i }));
        return { ...p, [id]: { ...(data || {}), candidates: merged } };
      });
    } catch (e) {
      console.error("suggest failed", e);
    } finally {
      setLoading((p) => ({ ...p, [id]: false }));
      inFlightRef.current.delete(id);
    }
  }

  async function assign(kind: "tag" | "category", id: string, icon: string) {
    await fetch("/api/admin/tag-icons/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        kind === "tag" ? { type: "tag", name: id, icon } : { type: "category", key: id, icon }
      ),
    });
    if (kind === "tag") setTagIcons((m) => ({ ...m, [id]: icon }));
    else setCatIcons((m) => ({ ...m, [id]: icon }));
  }

  /* biome-ignore lint/correctness/noNestedComponentDefinitions: UI panel scoped to this file only */
  function Panel({ item }: { item: Item }) {
    const sug = suggestion[item.id];
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
                title={current || (item.kind === "tag" ? "tabler:tag" : "tabler:category")}
                aria-label={current || (item.kind === "tag" ? "tabler:tag" : "tabler:category")}
              >
                <Icon
                  name={current || (item.kind === "tag" ? "tabler:tag" : "tabler:category")}
                  className="w-5 h-5"
                />
              </button>
              <span
                className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-base-200 px-2 py-1 text-xs text-base-content shadow opacity-0 group-hover/icon:opacity-100 group-focus-within/icon:opacity-100"
                role="tooltip"
              >
                {current || (item.kind === "tag" ? "tabler:tag" : "tabler:category")}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => generate(item.kind, item.id, item.title)}
            aria-label="refresh"
            title="刷新"
            disabled={loading[item.id]}
          >
            <Icon
              name={loading[item.id] ? "tabler:loader-2" : "tabler:refresh"}
              className={`w-4 h-4 ${loading[item.id] ? "animate-spin" : ""}`}
            />
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
    <div className="space-y-8">
      {groups.map((g) => {
        const catItem: Item = {
          kind: "category",
          id: g.key,
          title: g.title,
          currentIcon: categoryIcons[g.key] || null,
        };
        return (
          <section key={g.key} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon
                  name={(catIcons[g.key] || catItem.currentIcon || "tabler:category") as string}
                  className="w-5 h-5 text-primary/80"
                />
                <h3 className="text-lg font-semibold">{g.title}</h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => toggle(catItem.id, "category", catItem.title)}
                aria-label="toggle"
                title="展开"
              >
                <Icon
                  name={
                    loading[catItem.id]
                      ? "tabler:loader-2"
                      : open[catItem.id]
                        ? "tabler:chevron-down"
                        : "tabler:chevron-right"
                  }
                  className={`w-4 h-4 ${loading[catItem.id] ? "animate-spin" : ""}`}
                />
              </button>
            </div>
            {open[catItem.id] && (
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
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Icon name={item.currentIcon || "tabler:tag"} className="w-4 h-4" />
                        <span className="font-medium">{item.title}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => toggle(id, "tag", item.title)}
                        aria-label="toggle"
                      >
                        <Icon
                          name={
                            loading[id]
                              ? "tabler:loader-2"
                              : open[id]
                                ? "tabler:chevron-down"
                                : "tabler:chevron-right"
                          }
                          className={`w-4 h-4 ${loading[id] ? "animate-spin" : ""}`}
                        />
                      </button>
                    </div>
                    {open[id] && <Panel item={item} />}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
