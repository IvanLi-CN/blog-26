import { Fragment, useMemo, useState } from "react";
import {
  assembleMergeResult,
  type MergeRegion,
  type MergeResolutions,
  type MergeSide,
  pendingConflicts,
} from "~/components/content-three-way-result";
import { Badge, Button, Disclosure, Textarea } from "~/components/ui";

const SIDE_LABEL: Record<MergeSide, string> = { local: "本地", base: "基线", remote: "远端" };
const COLUMNS: MergeSide[] = ["local", "base", "remote"];

function textRows(text: string) {
  const count = text ? text.split("\n").length : 0;
  return Math.min(Math.max(count, 3), 14);
}

/**
 * Three-way merge editor: one aligned row per diff3 region, sources on the left
 * and the result on the right. Each conflict resolves inside its own result cell,
 * and that cell stays editable for hand merges.
 */
export function ContentThreeWayMerge({
  regions,
  onSave,
}: {
  regions: MergeRegion[];
  onSave?: (text: string) => void;
}) {
  const [resolutions, setResolutions] = useState<MergeResolutions>({});

  const pending = useMemo(() => pendingConflicts(regions, resolutions), [regions, resolutions]);
  const assembled = useMemo(
    () => assembleMergeResult(regions, resolutions),
    [regions, resolutions]
  );

  function choose(index: number, side: MergeSide) {
    const region = regions[index];
    if (!region || region.kind !== "conflict") return;
    setResolutions((current) => ({ ...current, [index]: { side, text: region[side] } }));
  }

  function applyToAll(side: MergeSide) {
    const next: MergeResolutions = {};
    regions.forEach((region, index) => {
      if (region.kind === "conflict") next[index] = { side, text: region[side] };
    });
    setResolutions(next);
  }

  function jump(direction: 1 | -1) {
    const rows = regions.flatMap((region, index) => (region.kind === "conflict" ? [index] : []));
    if (!rows.length) return;
    const position = rows.findIndex((index) => {
      const element = document.getElementById(`three-region-${index}`);
      if (!element) return false;
      const box = element.getBoundingClientRect();
      return direction > 0 ? box.top > 120 : box.bottom < 0;
    });
    const target = position >= 0 ? rows[position] : direction > 0 ? rows[0] : rows[rows.length - 1];
    document.getElementById(`three-region-${target}`)?.scrollIntoView({ block: "center" });
  }

  return (
    <div className="space-y-3" data-testid="content-three-way-merge">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={pending ? "warning" : "success"}>待决 {pending}</Badge>
        <Button size="sm" variant="outline" onClick={() => jump(-1)}>
          上一处冲突
        </Button>
        <Button size="sm" variant="outline" onClick={() => jump(1)}>
          下一处冲突
        </Button>
        <Button size="sm" variant="outline" onClick={() => applyToAll("local")}>
          全部采用本地
        </Button>
        <Button size="sm" variant="outline" onClick={() => applyToAll("remote")}>
          全部采用远端
        </Button>
        <Button size="sm" onClick={() => onSave?.(assembled)} disabled={!onSave || pending > 0}>
          保存到内容库
        </Button>
      </div>

      <div className="max-h-[38rem] overflow-auto rounded-2xl border border-border">
        <div className="sticky top-0 z-10 grid grid-cols-3 divide-x divide-border bg-surface text-[11px] font-medium text-muted-foreground">
          {COLUMNS.map((side) => (
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
                id={`three-region-${index}`}
                className="space-y-2 bg-warning/6 p-2"
              >
                <div className="grid grid-cols-3 divide-x divide-border rounded-lg bg-warning/10">
                  {COLUMNS.map((side) => (
                    <pre
                      key={side}
                      className="max-h-40 overflow-auto whitespace-pre-wrap break-words p-2 text-xs"
                    >
                      {region[side] || "（空）"}
                    </pre>
                  ))}
                </div>
                <div className="space-y-1 rounded-lg bg-warning/14 p-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] font-medium">冲突</span>
                    {(["local", "base", "remote"] as const).map((side) => (
                      <Button
                        key={side}
                        size="sm"
                        variant={resolutions[index]?.side === side ? "default" : "outline"}
                        aria-pressed={resolutions[index]?.side === side}
                        onClick={() => choose(index, side)}
                      >
                        用{SIDE_LABEL[side]}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={resolutions[index]?.text ?? ""}
                    onChange={(event) =>
                      setResolutions((current) => ({
                        ...current,
                        [index]: { side: "custom", text: event.target.value },
                      }))
                    }
                    rows={textRows(region.local)}
                    placeholder="未裁决：选一侧，或直接写合并结果"
                    aria-label={`冲突 ${index} 的合并结果`}
                  />
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
