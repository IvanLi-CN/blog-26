import { useEffect, useMemo, useState } from "react";
import type { ContentMergeEditorHandle } from "~/components/content-merge-editor";
import { Badge, Button, Textarea } from "~/components/ui";

type Region =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

type Side = "base" | "local" | "remote";

const SIDE_LABEL: Record<Side, string> = { base: "基线", local: "本地", remote: "远端" };

/**
 * Base / local / remote side by side. Stable regions are taken as merged; each
 * conflict keeps its own decision and the choices assemble the editable result.
 */
export function ContentThreeWayMerge({
  regions,
  onReady,
}: {
  regions: Region[];
  onReady?: (handle: ContentMergeEditorHandle) => void;
}) {
  const conflictIndexes = useMemo(
    () => regions.flatMap((region, index) => (region.kind === "conflict" ? [index] : [])),
    [regions]
  );
  const ordinal = useMemo(() => {
    const map = new Map<number, number>();
    let next = 0;
    regions.forEach((region, index) => {
      if (region.kind !== "conflict") return;
      next += 1;
      map.set(index, next);
    });
    return map;
  }, [regions]);
  const [choices, setChoices] = useState<Record<number, Side>>({});
  const [text, setText] = useState("");

  const assembled = useMemo(() => {
    const parts: string[] = [];
    regions.forEach((region, index) => {
      if (region.kind === "stable") {
        if (region.text) parts.push(region.text);
        return;
      }
      const side = choices[index] ?? "local";
      const value = region[side];
      if (value) parts.push(value);
    });
    return parts.join("\n");
  }, [regions, choices]);

  useEffect(() => {
    setText(assembled);
  }, [assembled]);

  useEffect(() => {
    onReady?.({ getText: () => text, setText: (next: string) => setText(next) });
  }, [onReady, text]);

  const unresolved = conflictIndexes.filter((index) => !choices[index]).length;

  return (
    <div className="space-y-3" data-testid="content-three-way-merge">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={unresolved ? "warning" : "success"}>
          {conflictIndexes.length} 处冲突 · 待决 {unresolved}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setChoices(Object.fromEntries(conflictIndexes.map((index) => [index, "local" as Side])))
          }
        >
          全部保留本地
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setChoices(
              Object.fromEntries(conflictIndexes.map((index) => [index, "remote" as Side]))
            )
          }
        >
          全部采用远端
        </Button>
      </div>

      <div className="max-h-80 space-y-2 overflow-auto">
        {regions.map((region, index) => {
          const key = `${region.kind}-${index}-${(region.kind === "stable" ? region.text : region.local).slice(0, 16)}`;
          return region.kind === "stable" ? (
            <pre
              key={key}
              className="rounded-xl bg-muted/32 p-2 text-xs whitespace-pre-wrap break-words"
            >
              {region.text}
            </pre>
          ) : (
            <div key={key} className="space-y-2 rounded-xl bg-warning/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">冲突 {ordinal.get(index) ?? index + 1}</span>
                {(["base", "local", "remote"] as const).map((side) => (
                  <Button
                    key={side}
                    size="sm"
                    variant={(choices[index] ?? "local") === side ? "default" : "outline"}
                    onClick={() => setChoices((current) => ({ ...current, [index]: side }))}
                  >
                    用{SIDE_LABEL[side]}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {(["base", "local", "remote"] as const).map((side) => (
                  <pre
                    key={side}
                    className="max-h-32 overflow-auto rounded-lg bg-muted/46 p-2 text-xs whitespace-pre-wrap break-words"
                  >
                    {region[side] || "（空）"}
                  </pre>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={10}
        aria-label="合并结果"
      />
    </div>
  );
}
