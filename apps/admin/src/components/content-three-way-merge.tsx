import { search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  WidgetType,
} from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Badge, Button } from "~/components/ui";
import { contentLanguageExtension } from "~/editor/merge-editor-language";
import { mergeEditorTheme } from "~/editor/merge-editor-theme";

export type MergeRegion =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

type Side = "local" | "base" | "remote";
type Pane = Side;

const PANE_LABEL: Record<Pane, string> = { local: "本地", base: "基线", remote: "远端" };
const PANE_HINT: Record<Pane, string> = {
  local: "可编辑 · 合并结果",
  base: "只读 · 共同祖先",
  remote: "只读 · 仓库版本",
};
const DECISION_LABEL: Record<Side, string> = {
  local: "采用本地",
  base: "采用基线",
  remote: "采用远端",
};

interface Span {
  index: number;
  from: number;
  to: number;
}

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

function ConflictActions({
  ordinal,
  decision,
  onDecide,
}: {
  ordinal: number;
  decision: Side | null;
  onDecide: (side: Side) => void;
}) {
  return (
    <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 shadow-sm">
      <span className="text-[11px] font-semibold text-foreground">冲突 {ordinal}</span>
      <Badge tone={decision ? "success" : "warning"}>{decision ? "已解决" : "未解决"}</Badge>
      {(["local", "base", "remote"] as const).map((side) => (
        <Button
          key={side}
          size="sm"
          title={DECISION_LABEL[side]}
          variant={decision === side ? "default" : "outline"}
          onClick={() => onDecide(side)}
        >
          {PANE_LABEL[side]}
        </Button>
      ))}
    </div>
  );
}

class ConflictPanel extends WidgetType {
  private root: Root | null = null;

  constructor(
    private readonly index: number,
    private readonly ordinal: number,
    private readonly decision: Side | null,
    private readonly onDecide: (index: number, side: Side) => void
  ) {
    super();
  }

  override eq(other: WidgetType) {
    return (
      other instanceof ConflictPanel &&
      other.index === this.index &&
      other.ordinal === this.ordinal &&
      other.decision === this.decision
    );
  }

  override ignoreEvent() {
    return true;
  }

  override toDOM() {
    const host = document.createElement("div");
    host.className = "cm-conflict-panel mb-1";
    this.root = createRoot(host);
    this.root.render(
      <ConflictActions
        ordinal={this.ordinal}
        decision={this.decision}
        onDecide={(side) => this.onDecide(this.index, side)}
      />
    );
    return host;
  }

  override destroy() {
    this.root?.unmount();
    this.root = null;
  }
}

function localPanels(
  regions: MergeRegion[],
  decisions: Map<number, Side>,
  onDecide: (index: number, side: Side) => void
) {
  const ordinals = new Map<number, number>();
  let ordinal = 0;
  regions.forEach((region, index) => {
    if (region.kind !== "conflict") return;
    ordinal += 1;
    ordinals.set(index, ordinal);
  });
  return EditorView.decorations.compute(["doc"], (state) => {
    const spans = conflictSpans(state.doc.toString(), regions, "local", decisions);
    return Decoration.set(
      spans.map((span) =>
        Decoration.widget({
          widget: new ConflictPanel(
            span.index,
            ordinals.get(span.index) ?? span.index + 1,
            decisions.get(span.index) ?? null,
            onDecide
          ),
          side: -1,
          block: true,
        }).range(span.from)
      ),
      true
    );
  });
}

const conflictMarks = (regions: MergeRegion[], side: Pane, decisions: Map<number, Side>) =>
  EditorView.decorations.compute(["doc"], (state) =>
    Decoration.set(
      conflictSpans(state.doc.toString(), regions, side, decisions).map((span) =>
        Decoration.mark({ class: "cm-merge-conflict" }).range(span.from, span.to)
      ),
      true
    )
  );

/**
 * Three-pane conflict resolution in one frame: local, base and remote. The local
 * pane is the editable merge target; each conflict offers the three decisions
 * through the shared button primitives.
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
  const [revision, setRevision] = useState(0);
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

  const syncScroll = useCallback((source: Pane) => {
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
  }, []);

  const decide = useCallback(
    (index: number, side: Side) => {
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
      if (span) local.dispatch({ changes: { from: span.from, to: span.to, insert: region[side] } });
      if (local.scrollDOM.scrollLeft !== 0) local.scrollDOM.scrollLeft = 0;
      setActive(index);
      setRevision((value) => value + 1);
      for (const pane of ["local", "base", "remote"] as const) editors.current[pane]?.dispatch({});
    },
    [regions]
  );

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
    setRevision((value) => value + 1);
    for (const pane of ["local", "base", "remote"] as const) editors.current[pane]?.dispatch({});
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

  useEffect(() => {
    decisions.current = new Map();
    setActive(null);
    const created: EditorView[] = [];
    for (const side of ["local", "base", "remote"] as const) {
      const parent = hosts.current[side];
      if (!parent) continue;
      const editable = side === "local";
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: texts[side],
          extensions: [
            lineNumbers(),
            EditorView.lineWrapping,
            highlightActiveLine(),
            keymap.of(searchKeymap),
            search({ top: true }),
            contentLanguageExtension(),
            mergeEditorTheme,
            ...(editable ? [localPanels(regions, decisions.current, decide)] : []),
            conflictMarks(regions, side, decisions.current),
            ...(editable ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
          ],
        }),
      });
      editors.current[side] = view;
      created.push(view);
      view.scrollDOM.addEventListener("scroll", () => syncScroll(side));
    }
    return () => {
      for (const view of created) view.destroy();
      editors.current = {};
    };
  }, [regions, texts, decide, syncScroll]);

  const position = (() => {
    if (!unresolved.length || active === null) return 0;
    const at = unresolved.indexOf(active);
    if (at >= 0) return at + 1;
    const next = unresolved.find((index) => index > active);
    return next === undefined ? 1 : unresolved.indexOf(next) + 1;
  })();

  return (
    <div className="space-y-3" data-testid="content-three-way-merge" data-revision={revision}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
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
        <Badge tone={unresolved.length ? "warning" : "success"}>
          已解决 {solved}/{conflictIndexes.length}
        </Badge>
        <span className="flex-1" />
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

      <div
        className="overflow-hidden rounded-2xl border border-border bg-code-surface"
        data-testid="content-three-way-panes"
      >
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-muted/40">
          {(["local", "base", "remote"] as const).map((side) => (
            <div key={side} className="flex items-baseline justify-between gap-2 px-3 py-1.5">
              <span className="text-[11px] font-semibold text-foreground">{PANE_LABEL[side]}</span>
              <span className="text-[10px] text-muted-foreground">{PANE_HINT[side]}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {(["local", "base", "remote"] as const).map((side) => (
            <div
              key={side}
              ref={(element) => {
                hosts.current[side] = element;
              }}
              className="h-96 overflow-hidden text-xs"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
