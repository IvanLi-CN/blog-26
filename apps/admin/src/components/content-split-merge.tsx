import { getChunks, goToNextChunk, goToPreviousChunk, MergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { ContentMergeEditorHandle } from "~/components/content-merge-editor";
import { Button } from "~/components/ui";

/** Side-by-side comparison; chunk boundaries come from the CodeMirror merge view. */
export function ContentSplitMerge({
  localText,
  remoteText,
  onReady,
}: {
  localText: string;
  remoteText: string;
  onReady?: (handle: ContentMergeEditorHandle) => void;
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
    view.current = next;
    onReady?.({
      getText: () => next.b.state.doc.toString(),
      setText: (text: string) =>
        next.b.dispatch({ changes: { from: 0, to: next.b.state.doc.length, insert: text } }),
    });
    return () => {
      next.destroy();
      view.current = null;
    };
  }, [localText, remoteText, onReady]);

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
      </div>
      <div
        ref={host}
        data-testid="content-split-merge"
        className="max-h-[28rem] overflow-auto rounded-2xl bg-muted/46 text-xs"
      />
    </div>
  );
}
