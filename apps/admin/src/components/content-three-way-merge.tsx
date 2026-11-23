import { defaultKeymap, history, historyKeymap, invertedEffects } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  WidgetType,
} from "@codemirror/view";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContentMergeHandle } from "~/components/content-merge-handle";
import { Badge, Button } from "~/components/ui";
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

/** Blank block used to keep the reference panes in step with the result pane. */
class RowSpacer extends WidgetType {
  constructor(private readonly height: number) {
    super();
  }

  override eq(other: WidgetType) {
    return other instanceof RowSpacer && other.height === this.height;
  }

  override toDOM() {
    const block = document.createElement("div");
    block.className = "cm-row-spacer";
    block.style.height = `${this.height}px`;
    return block;
  }

  override get estimatedHeight() {
    return this.height;
  }

  ignoreEvent() {
    return false;
  }
}

const setDecision = StateEffect.define<{ index: number; side: Side }>();
const clearDecision = StateEffect.define<number>();

/** Decisions live in editor state so undo reverts the decision with its text. */
const decisionsField = StateField.define<Map<number, Side>>({
  create: () => new Map(),
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(setDecision)) {
        next = new Map(next);
        next.set(effect.value.index, effect.value.side);
      } else if (effect.is(clearDecision)) {
        next = new Map(next);
        next.delete(effect.value);
      }
    }
    return next;
  },
});

const decisionHistory = invertedEffects.of((transaction) => {
  const effects: StateEffect<unknown>[] = [];
  for (const effect of transaction.effects) {
    if (!effect.is(setDecision)) continue;
    const previous = transaction.startState.field(decisionsField).get(effect.value.index);
    effects.push(
      previous
        ? setDecision.of({ index: effect.value.index, side: previous })
        : clearDecision.of(effect.value.index)
    );
  }
  return effects;
});

interface Span {
  index: number;
  from: number;
  to: number;
}

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

function ordinalsOf(regions: MergeRegion[]) {
  const ordinals = new Map<number, number>();
  let ordinal = 0;
  regions.forEach((region, index) => {
    if (region.kind !== "conflict") return;
    ordinal += 1;
    ordinals.set(index, ordinal);
  });
  return ordinals;
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
    <div className="inline-flex h-8 w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-card px-2 shadow-sm">
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
    host.className = "cm-conflict-panel";
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

function decisionPanels(regions: MergeRegion[], onDecide: (index: number, side: Side) => void) {
  const ordinals = ordinalsOf(regions);
  return EditorView.decorations.compute(["doc", decisionsField], (state) => {
    const decisions = state.field(decisionsField);
    const spans = conflictSpans(state.doc.toString(), regions, "result", decisions);
    return Decoration.set(
      spans
        .filter((span) => !decisions.has(span.index))
        .map((span) =>
          Decoration.widget({
            widget: new ConflictPanel(
              span.index,
              ordinals.get(span.index) ?? span.index + 1,
              null,
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

const conflictMarks = (regions: MergeRegion[], pane: Pane, panelHeight: number) =>
  EditorView.decorations.compute(["doc", decisionsField], (state) => {
    const decisions = state.field(decisionsField);
    const decorations: Decoration[] = conflictSpans(
      state.doc.toString(),
      regions,
      pane,
      decisions
    ).map((span) => Decoration.mark({ class: "cm-merge-conflict" }).range(span.from, span.to));
    if (pane !== "result") {
      for (const span of conflictSpans(state.doc.toString(), regions, pane, decisions)) {
        if (decisions.has(span.index)) continue;
        decorations.push(
          Decoration.widget({
            widget: new RowSpacer(panelHeight),
            side: -1,
            block: true,
          }).range(span.from)
        );
      }
    }
    return Decoration.set(decorations, true);
  });

/**
 * Three-way conflict resolution: local and remote are read-only references, the
 * middle pane is the editable result that gets saved. Decisions and their text
 * changes share one transaction, so undo reverts both and the panel returns.
 */
export function ContentThreeWayMerge({
  regions,
  localText,
  remoteText,
  panelHeight = 32,
  onReady,
  trailing,
}: {
  regions: MergeRegion[];
  localText: string;
  remoteText: string;
  panelHeight?: number;
  onReady?: (handle: ContentMergeHandle) => void;
  trailing?: ReactNode;
}) {
  const hosts = useRef<Record<Pane, HTMLDivElement | null>>({
    local: null,
    result: null,
    remote: null,
  });
  const editors = useRef<Partial<Record<Pane, EditorView>>>({});
  const syncing = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [status, setStatus] = useState({ solved: 0, total: 0 });
  const [active, setActive] = useState<number | null>(null);

  const texts: Record<Pane, string> = useMemo(
    () => ({ local: localText, result: localText, remote: remoteText }),
    [localText, remoteText]
  );
  const conflictIndexes = useMemo(
    () => regions.flatMap((region, index) => (region.kind === "conflict" ? [index] : [])),
    [regions]
  );

  const readStatus = useCallback(
    (view: EditorView) => {
      const decisions = view.state.field(decisionsField);
      const unresolved = conflictIndexes.filter((index) => !decisions.has(index));
      setStatus({
        solved: conflictIndexes.length - unresolved.length,
        total: conflictIndexes.length,
      });
    },
    [conflictIndexes]
  );

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
        result.state.field(decisionsField)
      ).find((candidate) => candidate.index === index);
      result.dispatch({
        changes: span ? { from: span.from, to: span.to, insert: region[side] } : undefined,
        effects: setDecision.of({ index, side }),
      });
      setActive(index);
    },
    [regions]
  );

  function decideAll(side: Side) {
    const result = editors.current.result;
    if (!result) return;
    const decisions = result.state.field(decisionsField);
    const spans = conflictSpans(result.state.doc.toString(), regions, "result", decisions);
    const changes = spans.flatMap((span) => {
      const region = regions[span.index];
      if (region.kind !== "conflict") return [];
      return [{ from: span.from, to: span.to, insert: region[side] }];
    });
    const effects = conflictIndexes.map((index) => setDecision.of({ index, side }));
    result.dispatch({
      changes: changes.sort((left, right) => left.from - right.from),
      effects,
    });
  }

  function jump(direction: 1 | -1) {
    const result = editors.current.result;
    if (!result) return;
    const decisions = result.state.field(decisionsField);
    const unresolved = conflictIndexes.filter((index) => !decisions.has(index));
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
        editor.state.field(decisionsField)
      ).find((candidate) => candidate.index === index);
      if (span) editor.dispatch({ effects: EditorView.scrollIntoView(span.from, { y: "center" }) });
    }
  }

  useEffect(() => {
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
            decisionsField,
            decisionHistory,
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
            search({ top: true }),
            contentLanguageExtension(),
            mergeEditorTheme,
            ...(editable ? [decisionPanels(regions, decide)] : []),
            conflictMarks(regions, pane, panelHeight),
            ...(editable ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged || update.transactions.length) readStatus(update.view);
            }),
          ],
        }),
      });
      editors.current[pane] = view;
      created.push(view);
      view.scrollDOM.addEventListener("scroll", () => syncScroll(pane));
    }
    const result = editors.current.result;
    if (result) {
      readStatus(result);
      onReadyRef.current?.({
        getText: () => result.state.doc.toString(),
        pending: () => {
          const decisions = result.state.field(decisionsField);
          const total = conflictIndexes.length;
          const solved = conflictIndexes.filter((index) => decisions.has(index)).length;
          return { unresolved: total - solved, total };
        },
      });
    }
    return () => {
      for (const view of created) view.destroy();
      editors.current = {};
    };
  }, [conflictIndexes, panelHeight, regions, texts, decide, syncScroll, readStatus]);

  const unresolvedCount = Math.max(0, status.total - status.solved);
  const position = (() => {
    if (!unresolvedCount || active === null) return 0;
    const result = editors.current.result;
    if (!result) return 0;
    const decisions = result.state.field(decisionsField);
    const unresolved = conflictIndexes.filter((index) => !decisions.has(index));
    const at = unresolved.indexOf(active);
    if (at >= 0) return at + 1;
    const next = unresolved.find((index) => index > active);
    return next === undefined ? 1 : unresolved.indexOf(next) + 1;
  })();

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
          {position}/{unresolvedCount}
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
        <Badge tone={unresolvedCount ? "warning" : "success"}>
          已解决 {status.solved}/{status.total}
        </Badge>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => decideAll("local")}>
          整篇采用本地
        </Button>
        <Button size="sm" variant="outline" onClick={() => decideAll("remote")}>
          整篇采用远端
        </Button>
        <span className="flex-1" />
        {trailing}
      </div>
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
