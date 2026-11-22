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
import { Badge, Button, Disclosure } from "~/components/ui";
import { contentLanguageExtension } from "~/editor/merge-editor-language";
import { mergeEditorTheme } from "~/editor/merge-editor-theme";

export type MergeRegion =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

type Side = "local" | "base" | "remote";
type Pane = "local" | "result" | "remote";

const PANE_LABEL: Record<Pane, string> = { local: "本地", result: "合并结果", remote: "远端" };
const PANE_HINT: Record<Pane, string> = {
  local: "只读 · 你的版本",
  result: "可编辑 · 保存这一栏",
  remote: "只读 · 仓库版本",
};
const SIDE_LABEL: Record<Side, string> = { local: "本地", base: "基线", remote: "远端" };
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

/** Expected visible text of each conflict in the given pane. */
function paneText(region: Extract<MergeRegion, { kind: "conflict" }>, pane: Pane, decision?: Side) {
  if (pane === "result") return decision ? region[decision] : region.local;
  return region[pane];
}

function conflictSpans(
  text: string,
  regions: MergeRegion[],
  pane: Pane,
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
    const value = paneText(region, pane, decisions.get(index));
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
  base,
  decision,
  onDecide,
}: {
  ordinal: number;
  base: string;
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
          {SIDE_LABEL[side]}
        </Button>
      ))}
      <Disclosure summary="查看基线" summaryClassName="text-[10px] leading-4">
        <pre className="max-h-32 w-full overflow-auto rounded-md bg-muted/50 p-2 text-[10px] whitespace-pre-wrap break-words">
          {base || "（空）"}
        </pre>
      </Disclosure>
    </div>
  );
}

class ConflictPanel extends WidgetType {
  private root: Root | null = null;

  constructor(
    private readonly index: number,
    private readonly ordinal: number,
    private readonly base: string,
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
        base={this.base}
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

function decisionPanels(
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
    const spans = conflictSpans(state.doc.toString(), regions, "result", decisions);
    return Decoration.set(
      spans.map((span) => {
        const region = regions[span.index];
        return Decoration.widget({
          widget: new ConflictPanel(
            span.index,
            ordinals.get(span.index) ?? span.index + 1,
            region.kind === "conflict" ? region.base : "",
            decisions.get(span.index) ?? null,
            onDecide
          ),
          side: -1,
          block: true,
        }).range(span.from);
      }),
      true
    );
  });
}

const conflictMarks = (regions: MergeRegion[], pane: Pane, decisions: Map<number, Side>) =>
  EditorView.decorations.compute(["doc"], (state) =>
    Decoration.set(
      conflictSpans(state.doc.toString(), regions, pane, decisions).map((span) =>
        Decoration.mark({ class: "cm-merge-conflict" }).range(span.from, span.to)
      ),
      true
    )
  );

/**
 * Three-way conflict resolution: local and remote are references, the middle
 * pane is the editable result that gets saved. The common ancestor is available
 * inside each conflict panel.
 */
export function ContentThreeWayMerge({
  regions,
  localText,
  remoteText,
  onSave,
}: {
  regions: MergeRegion[];
  localText: string;
  remoteText: string;
  onSave?: (text: string) => void;
}) {
  const hosts = useRef<Record<Pane, HTMLDivElement | null>>({
    local: null,
    result: null,
    remote: null,
  });
  const editors = useRef<Partial<Record<Pane, EditorView>>>({});
  const decisions = useRef<Map<number, Side>>(new Map());
  const syncing = useRef(false);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const texts: Record<Pane, string> = useMemo(
    () => ({ local: localText, result: localText, remote: remoteText }),
    [localText, remoteText]
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
    for (const pane of ["local", "result", "remote"] as const) {
      const other = editors.current[pane]?.scrollDOM;
      if (other && other !== origin)
        other.scrollTop = ratio * Math.max(0, other.scrollHeight - other.clientHeight);
    }
    syncing.current = false;
  }, []);

  const decide = useCallback(
    (index: number, side: Side) => {
      const result = editors.current.result;
      const region = regions[index];
      if (!result || !region || region.kind !== "conflict") return;
      const span = conflictSpans(
        result.state.doc.toString(),
        regions,
        "result",
        decisions.current
      ).find((candidate) => candidate.index === index);
      decisions.current.set(index, side);
      if (span)
        result.dispatch({ changes: { from: span.from, to: span.to, insert: region[side] } });
      setActive(index);
      setRevision((value) => value + 1);
      for (const pane of ["local", "result", "remote"] as const)
        editors.current[pane]?.dispatch({});
    },
    [regions]
  );

  function decideAll(side: Side) {
    const result = editors.current.result;
    if (!result) return;
    const spans = conflictSpans(result.state.doc.toString(), regions, "result", decisions.current);
    const changes = spans.flatMap((span) => {
      const region = regions[span.index];
      if (region.kind !== "conflict") return [];
      decisions.current.set(span.index, side);
      return [{ from: span.from, to: span.to, insert: region[side] }];
    });
    if (changes.length)
      result.dispatch({ changes: changes.sort((left, right) => left.from - right.from) });
    setRevision((value) => value + 1);
    for (const pane of ["local", "result", "remote"] as const) editors.current[pane]?.dispatch({});
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
    for (const pane of ["local", "result", "remote"] as const) {
      const editor = editors.current[pane];
      if (!editor) continue;
      const span = conflictSpans(
        editor.state.doc.toString(),
        regions,
        pane,
        decisions.current
      ).find((candidate) => candidate.index === index);
      if (span) editor.dispatch({ effects: EditorView.scrollIntoView(span.from, { y: "center" }) });
    }
  }

  useEffect(() => {
    decisions.current = new Map();
    setActive(null);
    const created: EditorView[] = [];
    for (const pane of ["local", "result", "remote"] as const) {
      const parent = hosts.current[pane];
      if (!parent) continue;
      const editable = pane === "result";
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: texts[pane],
          extensions: [
            lineNumbers(),
            EditorView.lineWrapping,
            highlightActiveLine(),
            keymap.of(searchKeymap),
            search({ top: true }),
            contentLanguageExtension(),
            mergeEditorTheme,
            ...(editable ? [decisionPanels(regions, decisions.current, decide)] : []),
            conflictMarks(regions, pane, decisions.current),
            ...(editable ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
          ],
        }),
      });
      editors.current[pane] = view;
      created.push(view);
      view.scrollDOM.addEventListener("scroll", () => syncScroll(pane));
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
          onClick={() => onSave?.(editors.current.result?.state.doc.toString() ?? "")}
          disabled={!onSave}
        >
          保存到内容库
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        中栏（合并结果）可编辑，保存写回它；左栏本地与右栏远端只作参照，每处冲突面板内可展开查看基线。
      </p>
      {unresolved.length ? (
        <p className="text-xs text-warning">
          仍有 {unresolved.length} 处未解决；现在保存会保留合并结果窗格的当前内容。
        </p>
      ) : null}

      <div
        className="overflow-hidden rounded-2xl border border-border bg-code-surface"
        data-testid="content-three-way-panes"
      >
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-muted/40">
          {(["local", "result", "remote"] as const).map((pane) => (
            <div key={pane} className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-[11px] font-semibold text-foreground">{PANE_LABEL[pane]}</span>
              {pane === "result" ? <Badge tone="default">保存这一栏</Badge> : null}
              <span className="ml-auto text-[10px] text-muted-foreground">{PANE_HINT[pane]}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {(["local", "result", "remote"] as const).map((pane) => (
            <div
              key={pane}
              ref={(element) => {
                hosts.current[pane] = element;
              }}
              className="h-96 overflow-hidden text-xs"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
