import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MergeRegion } from "~/components/content-three-way-result";
import { Button } from "~/components/ui";

type Side = "base" | "local" | "remote";
type Panes = "local" | "base" | "remote";

const MARKER_LOCAL = "<<<<<<< 本地";
const MARKER_BASE = "||||||| 基线";
const MARKER_SEPARATOR = "=======";
const MARKER_REMOTE = ">>>>>>> 远端";
const PANE_LABEL: Record<Panes, string> = { local: "本地", base: "基线", remote: "远端" };

interface ConflictBlock {
  from: number;
  to: number;
  base: string;
  local: string;
  remote: string;
}

/** Aligned source rows: every region is padded so the three panes keep the same line count. */
interface PaneRow {
  text: string;
  conflict: boolean;
  region: number;
}

function alignSources(regions: MergeRegion[]) {
  const panes: Record<Panes, PaneRow[]> = { local: [], base: [], remote: [] };
  regions.forEach((region, index) => {
    if (region.kind === "stable") {
      for (const line of region.text.split("\n"))
        for (const side of ["local", "base", "remote"] as const)
          panes[side].push({ text: line, conflict: false, region: index });
      return;
    }
    const sides: Record<Panes, string[]> = {
      local: region.local.split("\n"),
      base: region.base.split("\n"),
      remote: region.remote.split("\n"),
    };
    const height = Math.max(...Object.values(sides).map((lines) => lines.length));
    for (let row = 0; row < height; row += 1)
      for (const side of ["local", "base", "remote"] as const)
        panes[side].push({ text: sides[side][row] ?? "", conflict: true, region: index });
  });
  return panes;
}

function buildDocument(regions: MergeRegion[]) {
  return regions
    .map((region) =>
      region.kind === "stable"
        ? region.text
        : [
            MARKER_LOCAL,
            region.local,
            MARKER_BASE,
            region.base,
            MARKER_SEPARATOR,
            region.remote,
            MARKER_REMOTE,
          ].join("\n")
    )
    .join("\n");
}

/** Conflicts are located by their markers, the same way git records them. */
function findConflicts(view: EditorView): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  const doc = view.state.doc;
  let lineNumber = 1;
  while (lineNumber <= doc.lines) {
    const line = doc.line(lineNumber);
    if (!line.text.startsWith("<<<<<<<")) {
      lineNumber += 1;
      continue;
    }
    const local: string[] = [];
    const base: string[] = [];
    const remote: string[] = [];
    let section: Side = "local";
    let end = line.to;
    let cursor = lineNumber + 1;
    for (; cursor <= doc.lines; cursor += 1) {
      const current = doc.line(cursor);
      if (current.text.startsWith(MARKER_BASE)) {
        section = "base";
        continue;
      }
      if (current.text === MARKER_SEPARATOR) {
        section = "remote";
        continue;
      }
      if (current.text.startsWith(MARKER_REMOTE)) {
        end = current.to;
        break;
      }
      const target = section === "local" ? local : section === "base" ? base : remote;
      target.push(current.text);
    }
    blocks.push({
      from: line.from,
      to: end,
      local: local.join("\n"),
      base: base.join("\n"),
      remote: remote.join("\n"),
    });
    lineNumber = cursor + 1;
  }
  return blocks;
}

class ConflictWidget extends WidgetType {
  constructor(
    private readonly block: ConflictBlock,
    private readonly resolve: (
      block: ConflictBlock,
      action: "base" | "local" | "remote" | "both"
    ) => void
  ) {
    super();
  }

  override eq(other: WidgetType) {
    return other instanceof ConflictWidget && other.block.from === this.block.from;
  }

  override ignoreEvent() {
    return false;
  }

  override toDOM() {
    const wrap = document.createElement("div");
    wrap.className =
      "cm-conflict-actions mb-1 flex flex-wrap items-center gap-1 rounded-lg bg-warning/16 px-2 py-1";
    const label = document.createElement("span");
    label.textContent = "冲突裁决";
    label.className = "text-[11px] font-medium";
    wrap.appendChild(label);
    for (const [action, text] of [
      ["local", "采用本地"],
      ["base", "采用基线"],
      ["remote", "采用远端"],
      ["both", "都保留"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.className =
        "cursor-pointer rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted";
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.resolve(this.block, action);
      });
      wrap.appendChild(button);
    }
    return wrap;
  }
}

function conflictLayer(
  resolve: (block: ConflictBlock, action: "base" | "local" | "remote" | "both") => void
) {
  const build = (view: EditorView): DecorationSet =>
    Decoration.set(
      findConflicts(view).map((block) =>
        Decoration.widget({ widget: new ConflictWidget(block, resolve), side: -1 }).range(
          block.from
        )
      ),
      true
    );
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = build(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
}

/**
 * Three-way merge editor: aligned local/base/remote sources above, one merged
 * result buffer below. Conflicts resolve inline and only replace their block.
 */
export function ContentThreeWayMerge({
  regions,
  onSave,
}: {
  regions: MergeRegion[];
  onSave?: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const paneRefs = useRef<Record<Panes, HTMLDivElement | null>>({
    local: null,
    base: null,
    remote: null,
  });
  const syncing = useRef(false);
  const [pending, setPending] = useState(0);
  const [cursor, setCursor] = useState({ count: 0, index: 0 });

  const panes = useMemo(() => alignSources(regions), [regions]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const resolve = (block: ConflictBlock, action: "base" | "local" | "remote" | "both") => {
      const editor = view.current;
      if (!editor) return;
      const value = action === "both" ? [block.local, block.remote].join("\n") : block[action];
      editor.dispatch({
        changes: { from: block.from, to: block.to, insert: value },
        selection: { anchor: block.from + value.length },
      });
    };
    const track = (editor: EditorView) => {
      const blocks = findConflicts(editor);
      const head = editor.state.selection.main.head;
      const found = blocks.findIndex((block) => head <= block.to);
      setPending(blocks.length);
      setCursor({ count: blocks.length, index: found === -1 ? blocks.length - 1 : found });
    };
    const next = new EditorView({
      parent,
      state: EditorState.create({
        doc: buildDocument(regions),
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          conflictLayer(resolve),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet) track(update.view);
          }),
        ],
      }),
    });
    view.current = next;
    track(next);
    return () => {
      next.destroy();
      view.current = null;
    };
  }, [regions]);

  function syncScroll(source: Panes) {
    if (syncing.current) return;
    const origin = paneRefs.current[source];
    if (!origin) return;
    syncing.current = true;
    for (const side of ["local", "base", "remote"] as const) {
      const pane = paneRefs.current[side];
      if (pane && pane !== origin) pane.scrollTop = origin.scrollTop;
    }
    syncing.current = false;
  }

  function resolveRemaining(action: "local" | "remote") {
    const editor = view.current;
    if (!editor) return;
    const blocks = findConflicts(editor);
    if (!blocks.length) return;
    editor.dispatch({
      changes: blocks
        .map((block) => ({ from: block.from, to: block.to, insert: block[action] }))
        .sort((left, right) => left.from - right.from),
    });
  }

  function jump(direction: 1 | -1) {
    const editor = view.current;
    if (!editor) return;
    const blocks = findConflicts(editor);
    if (!blocks.length) return;
    const position = editor.state.selection.main.head;
    const target =
      direction > 0
        ? (blocks.find((block) => block.from > position) ?? blocks[0])
        : ([...blocks].reverse().find((block) => block.from < position) ??
          blocks[blocks.length - 1]);
    editor.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
  }

  const conflictRows = panes.local.reduce<number[]>((rows, entry, index) => {
    if (entry.conflict && rows[rows.length - 1] !== entry.region) rows.push(entry.region);
    return rows;
  }, []);

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
          {cursor.count ? cursor.index + 1 : 0}/{cursor.count}
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
        <Button size="sm" variant="outline" onClick={() => resolveRemaining("local")}>
          全部采用本地
        </Button>
        <Button size="sm" variant="outline" onClick={() => resolveRemaining("remote")}>
          全部采用远端
        </Button>
        <Button
          size="sm"
          onClick={() => onSave?.(view.current?.state.doc.toString() ?? "")}
          disabled={!onSave || pending > 0}
        >
          保存到内容库
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2" data-testid="content-three-way-sources">
        {(["local", "base", "remote"] as const).map((side) => (
          <div key={side} className="overflow-hidden rounded-xl border border-border">
            <p className="border-b border-border bg-muted/46 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {PANE_LABEL[side]}
            </p>
            <div
              ref={(element) => {
                paneRefs.current[side] = element;
              }}
              onScroll={() => syncScroll(side)}
              className="h-56 overflow-auto font-mono text-[11px] leading-5"
            >
              {panes[side].map((entry, index) => (
                <div
                  key={`${side}-${index}`}
                  data-conflict={entry.conflict ? "true" : undefined}
                  className={`flex gap-2 px-2 whitespace-pre ${entry.conflict ? "bg-warning/14" : ""}`}
                >
                  <span className="w-6 shrink-0 text-right text-muted-foreground">{index + 1}</span>
                  <span>{entry.text || " "}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          合并结果 · {conflictRows.length} 处冲突
        </p>
        <div
          ref={host}
          data-testid="content-three-way-result"
          className="max-h-[26rem] overflow-auto rounded-2xl bg-muted/46 text-xs"
        />
      </div>
    </div>
  );
}
