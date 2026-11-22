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
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Disclosure } from "~/components/ui";

type Region =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

type Side = "base" | "local" | "remote";

const MARKER_LOCAL = "<<<<<<< 本地";
const MARKER_BASE = "||||||| 基线";
const MARKER_SEPARATOR = "=======";
const MARKER_REMOTE = ">>>>>>> 远端";

interface ConflictBlock {
  from: number;
  to: number;
  base: string;
  local: string;
  remote: string;
}

function buildDocument(regions: Region[]) {
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

/** Conflict regions are located by their markers, the same way git records them. */
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
    private readonly resolve: (block: ConflictBlock, side: Side) => void
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
    for (const [side, text] of [
      ["base", "用基线"],
      ["local", "用本地"],
      ["remote", "用远端"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.className =
        "cursor-pointer rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted";
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.resolve(this.block, side);
      });
      wrap.appendChild(button);
    }
    return wrap;
  }
}

function conflictLayer(resolve: (block: ConflictBlock, side: Side) => void) {
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
 * Three-way merge tool: the result buffer starts with git-style conflict markers,
 * each block resolves in place, and manual edits outside the blocks survive.
 */
export function ContentThreeWayMerge({
  regions,
  onSave,
}: {
  regions: Region[];
  onSave?: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const resolve = (block: ConflictBlock, side: Side) => {
      const editor = view.current;
      if (!editor) return;
      editor.dispatch({
        changes: { from: block.from, to: block.to, insert: block[side] },
        selection: { anchor: block.from + block[side].length },
      });
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
            if (update.docChanged) setPending(findConflicts(update.view).length);
          }),
        ],
      }),
    });
    view.current = next;
    setPending(findConflicts(next).length);
    return () => {
      next.destroy();
      view.current = null;
    };
  }, [regions]);

  const conflicts = regions.flatMap((region, index) =>
    region.kind === "conflict" ? [{ ...region, index }] : []
  );

  function resolveRemaining(side: Side) {
    const editor = view.current;
    if (!editor) return;
    const blocks = findConflicts(editor);
    if (!blocks.length) return;
    editor.dispatch({
      changes: blocks
        .map((block) => ({ from: block.from, to: block.to, insert: block[side] }))
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

      {conflicts.length ? (
        <Disclosure summary={`三版参照 · ${conflicts.length} 处冲突`}>
          <div className="space-y-2">
            {conflicts.map((conflict, ordinal) => (
              <div
                key={`conflict-${conflict.index}`}
                className="space-y-2 rounded-xl bg-warning/10 p-2"
              >
                <span className="text-xs font-medium">冲突 {ordinal + 1}</span>
                <div className="grid gap-2 md:grid-cols-3">
                  {(["base", "local", "remote"] as const).map((side) => (
                    <div key={side} className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">
                        {side === "base" ? "基线" : side === "local" ? "本地" : "远端"}
                      </p>
                      <pre className="max-h-32 overflow-auto rounded-lg bg-muted/46 p-2 text-xs whitespace-pre-wrap break-words">
                        {conflict[side] || "（空）"}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      <div
        ref={host}
        data-testid="content-three-way-editor"
        className="max-h-[32rem] overflow-auto rounded-2xl bg-muted/46 text-xs"
      />
    </div>
  );
}
