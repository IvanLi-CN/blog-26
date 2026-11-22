import { useMemo, useRef, useState } from "react";
import {
  assembleLocalResult,
  type MergeRegion,
  undecidedConflicts,
} from "~/components/content-three-way-result";
import { Button, Disclosure, Textarea } from "~/components/ui";

type Side = "base" | "local" | "remote";

const SIDE_LABEL: Record<Side, string> = {
  local: "本地（合并结果）",
  base: "基线",
  remote: "远端",
};

/**
 * Three-way merge: local, base and remote are the only panes. The local pane is
 * the merge target, so a decision replaces that region's text in place; nothing
 * is duplicated into a fourth result surface.
 */
export function ContentThreeWayMerge({
  regions,
  onSave,
}: {
  regions: MergeRegion[];
  onSave?: (text: string) => void;
}) {
  const [state, setState] = useState(() => ({
    regions,
    conflicts: {} as Record<number, string>,
    decided: {} as Record<number, true>,
    active: null as number | null,
  }));
  if (state.regions !== regions) setState({ regions, conflicts: {}, decided: {}, active: null });
  const { conflicts, decided, active } = state;
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const pending = useMemo(() => undecidedConflicts(regions, decided), [regions, decided]);
  const assembled = useMemo(() => assembleLocalResult(regions, conflicts), [regions, conflicts]);
  const position = (() => {
    if (!pending.length || active === null) return 0;
    const at = pending.indexOf(active);
    if (at >= 0) return at + 1;
    const next = pending.find((index) => index > active);
    return next === undefined ? 1 : pending.indexOf(next) + 1;
  })();

  function localText(region: Extract<MergeRegion, { kind: "conflict" }>, index: number) {
    return conflicts[index] ?? region.local;
  }

  function choose(index: number, side: "base" | "remote" | "both") {
    const region = regions[index];
    if (!region || region.kind !== "conflict") return;
    const value = side === "both" ? [region.local, region.remote].join("\n") : region[side];
    setState((current) => ({
      ...current,
      conflicts: { ...current.conflicts, [index]: value },
      decided: { ...current.decided, [index]: true },
      active: index,
    }));
  }

  function edit(index: number, value: string) {
    setState((current) => ({
      ...current,
      conflicts: { ...current.conflicts, [index]: value },
      decided: { ...current.decided, [index]: true },
      active: index,
    }));
  }

  function applyToAll(side: "local" | "remote") {
    const next: Record<number, string> = {};
    const marks: Record<number, true> = {};
    regions.forEach((region, index) => {
      if (region.kind !== "conflict") return;
      next[index] = region[side];
      marks[index] = true;
    });
    setState({ regions, conflicts: next, decided: marks, active: null });
  }

  function jump(direction: 1 | -1) {
    if (!pending.length) return;
    const currentPosition = active === null ? -1 : pending.indexOf(active);
    const next =
      direction > 0
        ? (currentPosition + 1) % pending.length
        : (currentPosition - 1 + pending.length) % pending.length;
    const index = pending[next];
    setState((current) => ({ ...current, active: index }));
    rowRefs.current.get(index)?.scrollIntoView({ block: "center" });
  }

  return (
    <div className="space-y-3" data-testid="content-three-way-merge">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="上一处冲突"
          title="上一处冲突"
          onClick={() => jump(-1)}
        >
          ‹
        </Button>
        <span className="min-w-10 text-center text-xs text-muted-foreground" aria-live="polite">
          {position}/{pending.length}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label="下一处冲突"
          title="下一处冲突"
          onClick={() => jump(1)}
        >
          ›
        </Button>
        <Button size="sm" variant="outline" onClick={() => applyToAll("local")}>
          全部采用本地
        </Button>
        <Button size="sm" variant="outline" onClick={() => applyToAll("remote")}>
          全部采用远端
        </Button>
        <Button
          size="sm"
          onClick={() => onSave?.(assembled)}
          disabled={!onSave || pending.length > 0}
        >
          保存到内容库
        </Button>
      </div>

      <div className="max-h-[36rem] overflow-auto rounded-2xl border border-border">
        <div className="sticky top-0 z-10 grid grid-cols-3 divide-x divide-border bg-surface text-[11px] font-medium text-muted-foreground">
          {(["local", "base", "remote"] as const).map((side) => (
            <div key={side} className="px-2 py-1">
              {SIDE_LABEL[side]}
            </div>
          ))}
        </div>
        <div className="divide-y divide-border">
          {regions.map((region, index) =>
            region.kind === "stable" ? (
              <div key={`stable-${index}`} className="px-2 py-1">
                <Disclosure
                  summary={`未更改 ${region.text ? region.text.split("\n").length : 0} 行`}
                  summaryClassName="text-xs"
                >
                  <pre className="rounded-lg bg-muted/32 p-2 text-xs whitespace-pre-wrap break-words">
                    {region.text}
                  </pre>
                </Disclosure>
              </div>
            ) : (
              <div
                key={`conflict-${index}`}
                ref={(element) => {
                  if (element) rowRefs.current.set(index, element);
                  else rowRefs.current.delete(index);
                }}
                className="grid grid-cols-3 divide-x divide-border bg-warning/8"
              >
                <div className="space-y-1 p-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] font-medium">冲突</span>
                    {(["base", "remote"] as const).map((side) => (
                      <Button
                        key={side}
                        size="sm"
                        variant="outline"
                        onClick={() => choose(index, side)}
                      >
                        用{SIDE_LABEL[side]}
                      </Button>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => choose(index, "both")}>
                      都保留
                    </Button>
                  </div>
                  <Textarea
                    value={localText(region, index)}
                    onChange={(event) => edit(index, event.target.value)}
                    rows={Math.min(Math.max(region.local.split("\n").length, 3), 12)}
                    aria-label={`冲突 ${index} 的合并结果`}
                  />
                </div>
                {(["base", "remote"] as const).map((side) => (
                  <pre
                    key={side}
                    className="max-h-40 overflow-auto whitespace-pre-wrap break-words p-2 text-xs"
                  >
                    {region[side] || "（空）"}
                  </pre>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
