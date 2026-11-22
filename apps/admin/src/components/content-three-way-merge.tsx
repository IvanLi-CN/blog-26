import { EditorState, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
  lineNumbers,
  ViewPlugin,
} from "@codemirror/view";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui";
import { mergeEditorTheme } from "~/editor/merge-editor-theme";

export type MergeRegion =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

type Side = "local" | "base" | "remote";
type Pane = Side;

const PANE_LABEL: Record<Pane, string> = { local: "本地", base: "基线", remote: "远端" };
const SIDE_LABEL: Record<Side, string> = { local: "本地", base: "基线", remote: "远端" };

interface Span {
  index: number;
  from: number;
  to: number;
}

/** Locate conflicts in one pane; the local pane uses its current content. */
function conflictSpans(
  text: string,
  regions: MergeRegion[],
  side: Pane,
  decisions: Map<number, Side>
): Span[] {
  const spans: Span[] = [];
  let cursor = 0;
  regions.forEach((region, index) => {
    if (region.kind === "stable") {
      const found = region.text ? text.indexOf(region.text, cursor) : -1;
      if (found !== -1) cursor = found + region.text.length;
      return;
    }
    const value =
      side === "local"
        ? decisions.get(index)
          ? region[decisions.get(index) as Side]
          : region.local
        : region[side];
    if (!value) return;
    const from = text.indexOf(value, cursor);
    if (from === -1) return;
    cursor = from + value.length;
    spans.push({ index, from, to: cursor });
  });
  return spans;
}

class DecisionMarker extends GutterMarker {
  constructor(
    private readonly decision: Side | null,
    private readonly choose: (side: Side) => void
  ) {
    super();
  }

  override eq() {
    return false;
  }

  override toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "inline-flex gap-0.5 pr-1";
    for (const side of ["local", "base", "remote"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = side === "local" ? "本" : side === "base" ? "基" : "远";
      button.title = `采用${SIDE_LABEL[side]}`;
      button.className =
        this.decision === side
          ? "cursor-pointer rounded border border-primary/60 bg-primary/20 px-1 text-[10px] leading-4 text-foreground"
          : "cursor-pointer rounded border border-border bg-card px-1 text-[10px] leading-4 text-foreground hover:bg-muted";
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.choose(side);
      });
      wrap.appendChild(button);
    }
    return wrap;
  }
}

function conflictMarks(
  regions: MergeRegion[],
  side: Pane,
  decisions: Map<number, Side>,
  getView: () => EditorView | null
) {
  const build = (): DecorationSet => {
    const view = getView();
    if (!view) return Decoration.set([]);
    return Decoration.set(
      conflictSpans(view.state.doc.toString(), regions, side, decisions).map((span) =>
        Decoration.mark({ class: "cm-merge-conflict" }).range(span.from, span.to)
      ),
      true
    );
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor() {
        this.decorations = build();
      }
      update(update: {
        docChanged: boolean;
        transactions: readonly { effects: readonly unknown[] }[];
      }) {
        if (update.docChanged || update.transactions.length) this.decorations = build();
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
}

/**
 * Three-pane conflict resolution: local, base and remote only. The local pane is
 * the merge target; each conflict decides locally, and unresolved conflicts are
 * reported without blocking the save.
 */
export function ContentThreeWayMerge({
  regions,
  localText,
  baseText,
  remoteText,
  onSave,
}: {
  regions: MergeRegion[];
  localText: string;
  baseText: string;
  remoteText: string;
  onSave?: (text: string) => void;
}) {
  const hosts = useRef<Record<Pane, HTMLDivElement | null>>({
    local: null,
    base: null,
    remote: null,
  });
  const editors = useRef<Partial<Record<Pane, EditorView>>>({});
  const decisions = useRef<Map<number, Side>>(new Map());
  const syncing = useRef(false);
  const [tick, setTick] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const texts: Record<Pane, string> = useMemo(
    () => ({ local: localText, base: baseText, remote: remoteText }),
    [localText, baseText, remoteText]
  );

  const conflictIndexes = useMemo(
    () => regions.flatMap((region, index) => (region.kind === "conflict" ? [index] : [])),
    [regions]
  );
  const unresolved = conflictIndexes.filter((index) => !decisions.current.has(index));
  const solved = conflictIndexes.length - unresolved.length;

  function refresh() {
    setTick((value) => value + 1);
    for (const side of ["local", "base", "remote"] as const) editors.current[side]?.dispatch({});
  }

  function decide(index: number, side: Side) {
    const local = editors.current.local;
    const region = regions[index];
    if (!local || !region || region.kind !== "conflict") return;
    const span = conflictSpans(
      local.state.doc.toString(),
      regions,
      "local",
      decisions.current
    ).find((candidate) => candidate.index === index);
    decisions.current.set(index, side);
    if (span) {
      local.dispatch({
        changes: { from: span.from, to: span.to, insert: region[side] },
        selection: { anchor: span.from + region[side].length },
      });
    }
    setActive(index);
    refresh();
  }

  function decideAll(side: Side) {
    const local = editors.current.local;
    if (!local) return;
    const spans = conflictSpans(local.state.doc.toString(), regions, "local", decisions.current);
    const changes = spans.flatMap((span) => {
      const region = regions[span.index];
      if (region.kind !== "conflict") return [];
      decisions.current.set(span.index, side);
      return [{ from: span.from, to: span.to, insert: region[side] }];
    });
    if (changes.length)
      local.dispatch({ changes: changes.sort((left, right) => left.from - right.from) });
    refresh();
  }

  function jump(direction: 1 | -1) {
    if (!unresolved.length) return;
    const currentPosition = active === null ? -1 : unresolved.indexOf(active);
    const next =
      direction > 0
        ? (currentPosition + 1) % unresolved.length
        : (currentPosition - 1 + unresolved.length) % unresolved.length;
    const index = unresolved[next];
    setActive(index);
    for (const side of ["local", "base", "remote"] as const) {
      const editor = editors.current[side];
      if (!editor) continue;
      const span = conflictSpans(
        editor.state.doc.toString(),
        regions,
        side,
        decisions.current
      ).find((candidate) => candidate.index === index);
      if (span) editor.dispatch({ effects: EditorView.scrollIntoView(span.from, { y: "center" }) });
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: editors are built once per document set
  useEffect(() => {
    decisions.current = new Map();
    setActive(null);
    const created: EditorView[] = [];
    for (const side of ["local", "base", "remote"] as const) {
      const parent = hosts.current[side];
      if (!parent) continue;
      const localPane = side === "local";
      const markers = () =>
        localPane
          ? conflictSpans(
              editors.current.local?.state.doc.toString() ?? "",
              regions,
              "local",
              decisions.current
            )
          : [];
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: texts[side],
          extensions: [
            ...(localPane ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
            lineNumbers(),
            mergeEditorTheme,
            conflictMarks(regions, side, decisions.current, () => editors.current[side] ?? null),
            gutter({
              class: "cm-conflict-gutter",
              markers: () =>
                RangeSet.of(
                  markers().map((span) =>
                    new DecisionMarker(decisions.current.get(span.index) ?? null, (chosen) =>
                      decide(span.index, chosen)
                    ).range(editors.current.local?.state.doc.lineAt(span.from).from ?? span.from)
                  ),
                  true
                ),
            }),
          ],
        }),
      });
      editors.current[side] = view;
      created.push(view);
      view.scrollDOM.addEventListener("scroll", () => syncScroll(side));
    }
    refresh();
    return () => {
      for (const view of created) view.destroy();
      editors.current = {};
    };
  }, [regions, texts]);

  function syncScroll(source: Pane) {
    if (syncing.current) return;
    const origin = editors.current[source]?.scrollDOM;
    if (!origin) return;
    syncing.current = true;
    const ratio = origin.scrollTop / Math.max(1, origin.scrollHeight - origin.clientHeight);
    for (const side of ["local", "base", "remote"] as const) {
      const pane = editors.current[side]?.scrollDOM;
      if (pane && pane !== origin)
        pane.scrollTop = ratio * Math.max(0, pane.scrollHeight - pane.clientHeight);
    }
    syncing.current = false;
  }

  const position = (() => {
    if (!unresolved.length || active === null) return 0;
    const at = unresolved.indexOf(active);
    if (at >= 0) return at + 1;
    const next = unresolved.find((index) => index > active);
    return next === undefined ? 1 : unresolved.indexOf(next) + 1;
  })();

  return (
    <div className="space-y-3" data-testid="content-three-way-merge" data-tick={tick}>
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
          {position}/{unresolved.length}
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
        <span className="text-xs text-muted-foreground">
          已解决 {solved}/{conflictIndexes.length}
        </span>
        <Button size="sm" variant="outline" onClick={() => decideAll("local")}>
          整篇采用本地
        </Button>
        <Button size="sm" variant="outline" onClick={() => decideAll("remote")}>
          整篇采用远端
        </Button>
        <Button
          size="sm"
          onClick={() => onSave?.(editors.current.local?.state.doc.toString() ?? "")}
          disabled={!onSave}
        >
          保存到内容库
        </Button>
      </div>
      {unresolved.length ? (
        <p className="text-xs text-warning">
          仍有 {unresolved.length} 处未解决；现在保存会保留本地窗格的当前内容。
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2" data-testid="content-three-way-panes">
        {(["local", "base", "remote"] as const).map((side) => (
          <div key={side} className="overflow-hidden rounded-xl border border-border">
            <p className="border-b border-border bg-muted/46 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {PANE_LABEL[side]}
            </p>
            <div
              ref={(element) => {
                hosts.current[side] = element;
              }}
              className="h-64 overflow-auto text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
