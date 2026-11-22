import { getChunks, goToNextChunk, goToPreviousChunk, MergeView } from "@codemirror/merge";
import { RangeSet, StateEffect } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { Button } from "~/components/ui";

type Chunk = { fromA: number; toA: number; fromB: number; toB: number };

class ChunkAction extends GutterMarker {
  constructor(
    private readonly chunk: Chunk,
    private readonly run: () => void
  ) {
    super();
  }

  override toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.title = "本处采用远端";
    button.textContent = "←";
    button.className = "mr-1 cursor-pointer rounded px-1 text-[10px] leading-4 text-primary";
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

/** One accept control per change chunk, drawn inside the local pane gutter. */
function chunkActions(getRemote: () => EditorView | null) {
  return gutter({
    class: "cm-chunk-actions",
    markers: (view) => {
      const chunks = getChunks(view.state)?.chunks ?? [];
      return RangeSet.of(
        chunks.map((chunk) =>
          new ChunkAction(chunk, () => {
            const remote = getRemote();
            if (!remote) return;
            view.dispatch({
              changes: {
                from: chunk.fromB,
                to: chunk.toB,
                insert: remote.state.sliceDoc(chunk.fromA, chunk.toA),
              },
            });
          }).range(view.state.doc.lineAt(chunk.fromB).from)
        ),
        true
      );
    },
  });
}

/** Side-by-side comparison; chunk boundaries come from the CodeMirror merge view. */
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

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const readOnly = EditorView.editable.of(false);
    const next = new MergeView({
      parent,
      a: { doc: remoteText, extensions: [readOnly] },
      b: { doc: localText },
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3 },
    });
    next.b.dispatch({
      effects: StateEffect.appendConfig.of(chunkActions(() => view.current?.a ?? null)),
    });
    view.current = next;
    return () => {
      next.destroy();
      view.current = null;
    };
  }, [localText, remoteText]);

  function takeRemoteChunk() {
    const merge = view.current;
    if (!merge) return;
    const chunks = getChunks(merge.b.state)?.chunks ?? [];
    if (!chunks.length) return;
    const position = merge.b.state.selection.main.head;
    const chunk =
      chunks.find((candidate) => position >= candidate.fromB && position <= candidate.toB) ??
      chunks[0];
    merge.b.dispatch({
      changes: {
        from: chunk.fromB,
        to: chunk.toB,
        insert: merge.a.state.sliceDoc(chunk.fromA, chunk.toA),
      },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => view.current && goToPreviousChunk(view.current.b)}
        >
          上一处差异
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => view.current && goToNextChunk(view.current.b)}
        >
          下一处差异
        </Button>
        <Button size="sm" onClick={takeRemoteChunk}>
          本处采用远端
        </Button>
        <Button
          size="sm"
          onClick={() => view.current && onSave?.(view.current.b.state.doc.toString())}
          disabled={!onSave}
        >
          保存到内容库
        </Button>
      </div>
      <div
        ref={host}
        data-testid="content-split-merge"
        className="max-h-[28rem] overflow-auto rounded-2xl bg-muted/46 text-xs"
      />
    </div>
  );
}
