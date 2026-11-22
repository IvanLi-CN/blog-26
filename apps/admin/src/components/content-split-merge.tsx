import { getChunks, goToNextChunk, goToPreviousChunk, MergeView } from "@codemirror/merge";
import { RangeSet, StateEffect } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui";
import { mergeEditorTheme } from "~/editor/merge-editor-theme";

type Chunk = { fromA: number; toA: number; fromB: number; toB: number };

class ChunkAction extends GutterMarker {
  constructor(
    private readonly chunk: Chunk,
    private readonly run: () => void
  ) {
    super();
  }

  override toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "inline-flex gap-0.5 pr-1";
    const remote = document.createElement("button");
    remote.type = "button";
    remote.title = "采用远端的这一块";
    remote.textContent = "←";
    remote.className =
      "cursor-pointer rounded border border-border bg-card px-1 text-[10px] leading-4 text-foreground hover:bg-muted";
    remote.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.run();
    });
    wrap.appendChild(remote);
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

/** Two decisions per change chunk, inside the local pane's gutter. */
function chunkActions(getLocal: () => EditorView | null, getRemote: () => EditorView | null) {
  return gutter({
    class: "cm-chunk-actions",
    markers: (view) => {
      const local = getLocal();
      const remote = getRemote();
      if (!local || !remote) return RangeSet.empty;
      const chunks = getChunks(view.state)?.chunks ?? [];
      return RangeSet.of(
        chunks.map((chunk) => {
          const line = view.state.doc.lineAt(Math.min(chunk.fromB, view.state.doc.length)).from;
          return new ChunkAction(chunk, () => {
            local.dispatch({
              changes: {
                from: chunk.fromB,
                to: chunk.toB,
                insert: remote.state.sliceDoc(chunk.fromA, chunk.toA),
              },
            });
          }).range(line);
        }),
        true
      );
    },
  });
}

function pushLocalActions(getLocal: () => EditorView | null, getRemote: () => EditorView | null) {
  return gutter({
    class: "cm-chunk-push",
    markers: (view) => {
      const local = getLocal();
      const remote = getRemote();
      if (!local || !remote) return RangeSet.empty;
      const chunks = getChunks(local.state)?.chunks ?? [];
      return RangeSet.of(
        chunks.map((chunk) => {
          const line = view.state.doc.lineAt(Math.min(chunk.fromA, view.state.doc.length)).from;
          return new PushLocalAction(chunk, () => {
            remote.dispatch({
              changes: {
                from: chunk.fromA,
                to: chunk.toA,
                insert: local.state.sliceDoc(chunk.fromB, chunk.toB),
              },
            });
            local.dispatch({});
          }).range(line);
        }),
        true
      );
    },
  });
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
  const [chunks, setChunks] = useState({ count: 0, index: 0 });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
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
    next.b.dispatch({
      effects: StateEffect.appendConfig.of(
        chunkActions(
          () => view.current?.b ?? null,
          () => view.current?.a ?? null
        )
      ),
    });
    next.a.dispatch({
      effects: StateEffect.appendConfig.of(
        pushLocalActions(
          () => view.current?.b ?? null,
          () => view.current?.a ?? null
        )
      ),
    });
    const track = () => {
      const list = getChunks(next.b.state)?.chunks ?? [];
      const head = next.b.state.selection.main.head;
      const found = list.findIndex((chunk) => head <= chunk.toB);
      setChunks({ count: list.length, index: found === -1 ? list.length - 1 : found });
    };
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="上一处冲突"
          title="上一处冲突"
          onClick={() => view.current && goToPreviousChunk(view.current.b)}
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
          onClick={() => view.current && goToNextChunk(view.current.b)}
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
        左为远端、右为本地；两侧都可直接编辑，右侧内容就是保存结果。行内按钮把所在侧的这一块复制到另一侧。
      </p>
      <div
        ref={host}
        data-testid="content-split-merge"
        className="max-h-[32rem] overflow-auto rounded-2xl bg-code-surface text-xs"
      />
    </div>
  );
}
