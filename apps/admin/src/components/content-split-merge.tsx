import { getChunks, MergeView } from "@codemirror/merge";
import { RangeSet, StateEffect } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui";
import { mergeEditorTheme } from "~/editor/merge-editor-theme";

type Chunk = { fromA: number; toA: number; fromB: number; toB: number };

function chunkKey(chunk: Chunk) {
  return `${chunk.fromA}:${chunk.toA}`;
}

class ChunkAction extends GutterMarker {
  constructor(
    private readonly chunk: Chunk,
    private readonly adopt: () => void,
    private readonly keep: () => void
  ) {
    super();
  }

  override toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "inline-flex gap-0.5 pr-1";
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.title = "采用远端的这一块";
    adopt.textContent = "←";
    adopt.className =
      "cursor-pointer rounded border border-border bg-card px-1 text-[10px] leading-4 text-foreground hover:bg-muted";
    adopt.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.adopt();
    });
    wrap.appendChild(adopt);
    const keep = document.createElement("button");
    keep.type = "button";
    keep.title = "保留本地的这一块";
    keep.textContent = "✓";
    keep.className =
      "cursor-pointer rounded border border-border bg-card px-1 text-[10px] leading-4 text-foreground hover:bg-muted";
    keep.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.keep();
    });
    wrap.appendChild(keep);
    return wrap;
  }

  override eq() {
    return false;
  }
}

class PushLocalAction extends GutterMarker {
  constructor(
    private readonly chunk: Chunk,
    private readonly run: () => void
  ) {
    super();
  }

  override toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.title = "把本地的这一块写回远端";
    button.textContent = "→";
    button.className =
      "mr-1 cursor-pointer rounded border border-border bg-card px-1 text-[10px] leading-4 text-foreground hover:bg-muted";
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.run();
    });
    return button;
  }

  override eq() {
    return false;
  }
}

/** Side-by-side comparison; both panes stay editable and the local pane is the result. */
export function ContentSplitMerge({
  localText,
  remoteText,
  onSave,
}: {
  localText: string;
  remoteText: string;
  onSave?: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<MergeView | null>(null);
  const resolved = useRef<Set<string>>(new Set());
  const trackRef = useRef<() => void>(() => undefined);
  const [chunks, setChunks] = useState({ count: 0, index: 0 });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    resolved.current = new Set();

    const allChunks = () => (view.current ? (getChunks(view.current.b.state)?.chunks ?? []) : []);
    const openChunks = () => allChunks().filter((chunk) => !resolved.current.has(chunkKey(chunk)));

    const refresh = () => {
      view.current?.a.dispatch({});
      view.current?.b.dispatch({});
    };

    const adoptChunk = (chunk: Chunk) => {
      const merge = view.current;
      if (!merge) return;
      merge.b.dispatch({
        changes: {
          from: chunk.fromB,
          to: chunk.toB,
          insert: merge.a.state.sliceDoc(chunk.fromA, chunk.toA),
        },
      });
    };

    const keepChunk = (chunk: Chunk) => {
      resolved.current.add(chunkKey(chunk));
      refresh();
      trackRef.current();
    };

    const localGutter = gutter({
      class: "cm-chunk-actions",
      markers: (pane) =>
        RangeSet.of(
          openChunks().map((chunk) =>
            new ChunkAction(
              chunk,
              () => adoptChunk(chunk),
              () => keepChunk(chunk)
            ).range(pane.state.doc.lineAt(Math.min(chunk.fromB, pane.state.doc.length)).from)
          ),
          true
        ),
    });

    const remoteGutter = gutter({
      class: "cm-chunk-push",
      markers: (pane) =>
        RangeSet.of(
          openChunks().map((chunk) =>
            new PushLocalAction(chunk, () => {
              const merge = view.current;
              if (!merge) return;
              merge.a.dispatch({
                changes: {
                  from: chunk.fromA,
                  to: chunk.toA,
                  insert: merge.b.state.sliceDoc(chunk.fromB, chunk.toB),
                },
              });
              resolved.current.add(chunkKey(chunk));
              refresh();
              trackRef.current();
            }).range(pane.state.doc.lineAt(Math.min(chunk.fromA, pane.state.doc.length)).from)
          ),
          true
        ),
    });

    const next = new MergeView({
      parent,
      a: { doc: remoteText },
      b: { doc: localText },
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3 },
    });
    view.current = next;
    next.a.dispatch({ effects: StateEffect.appendConfig.of(mergeEditorTheme) });
    next.b.dispatch({ effects: StateEffect.appendConfig.of(mergeEditorTheme) });
    next.b.dispatch({ effects: StateEffect.appendConfig.of(localGutter) });
    next.a.dispatch({ effects: StateEffect.appendConfig.of(remoteGutter) });

    const track = () => {
      const list = openChunks();
      const head = next.b.state.selection.main.head;
      const found = list.findIndex((chunk) => head <= chunk.toB);
      setChunks({ count: list.length, index: found === -1 ? list.length - 1 : found });
    };
    trackRef.current = track;
    track();
    next.b.dispatch({
      effects: StateEffect.appendConfig.of(
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet) track();
        })
      ),
    });
    return () => {
      next.destroy();
      view.current = null;
    };
  }, [localText, remoteText]);

  function replaceLocal(text: string) {
    const editor = view.current?.b;
    if (!editor) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
  }

  function jump(direction: 1 | -1) {
    const editor = view.current?.b;
    if (!editor) return;
    const list = (getChunks(editor.state)?.chunks ?? []).filter(
      (chunk) => !resolved.current.has(chunkKey(chunk))
    );
    if (!list.length) return;
    const head = editor.state.selection.main.head;
    const target =
      direction > 0
        ? (list.find((chunk) => chunk.fromB > head) ?? list[0])
        : ([...list].reverse().find((chunk) => chunk.fromB < head) ?? list[list.length - 1]);
    editor.dispatch({
      selection: { anchor: target.fromB },
      effects: EditorView.scrollIntoView(target.fromB, { y: "center" }),
    });
  }

  return (
    <div className="space-y-2">
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
          {chunks.count ? chunks.index + 1 : 0}/{chunks.count}
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
        <Button size="sm" variant="outline" onClick={() => replaceLocal(localText)}>
          整篇回到本地
        </Button>
        <Button size="sm" variant="outline" onClick={() => replaceLocal(remoteText)}>
          整篇采用远端
        </Button>
        <Button
          size="sm"
          onClick={() => view.current && onSave?.(view.current.b.state.doc.toString())}
          disabled={!onSave}
        >
          保存到内容库
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        左为远端、右为本地；两侧都可直接编辑，右侧内容就是保存结果。本地沟槽 `←` 采用远端这一块、`✓`
        保留本地这一块；远端沟槽 `→` 把本地这一块写回远端。
      </p>
      <div
        ref={host}
        data-testid="content-split-merge"
        className="max-h-[32rem] overflow-auto rounded-2xl bg-code-surface text-xs"
      />
    </div>
  );
}
