import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  acceptChunk,
  getChunks,
  goToNextChunk,
  goToPreviousChunk,
  rejectChunk,
  unifiedMergeView,
} from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui";

export interface ContentMergeEditorHandle {
  getText(): string;
}

export interface ContentMergeEditorProps {
  /** Document kept in the content library. */
  localText: string;
  /** Document currently stored in the repository. */
  remoteText: string;
  onReady?: (handle: ContentMergeEditorHandle) => void;
  onSave?: (text: string) => void;
}

/**
 * Unified merge view: the editable buffer is the local document, the reference
 * document is the repository version. Chunk accept/reject belong to CodeMirror.
 */
export function ContentMergeEditor({
  localText,
  remoteText,
  onReady,
  onSave,
}: ContentMergeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const [chunkCount, setChunkCount] = useState(0);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const next = new EditorView({
      parent,
      state: EditorState.create({
        doc: localText,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet)
              setChunkCount(getChunks(update.state)?.chunks.length ?? 0);
          }),
          unifiedMergeView({ original: remoteText, mergeControls: false }),
        ],
      }),
    });
    view.current = next;
    setChunkCount(getChunks(next.state)?.chunks.length ?? 0);
    onReady?.({ getText: () => next.state.doc.toString() });
    return () => {
      next.destroy();
      view.current = null;
    };
  }, [localText, remoteText, onReady]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (view.current) goToPreviousChunk(view.current);
          }}
        >
          上一处差异
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (view.current) goToNextChunk(view.current);
          }}
        >
          下一处差异
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (view.current) rejectChunk(view.current);
          }}
        >
          采用远端本处
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (view.current) acceptChunk(view.current);
          }}
        >
          保留本地本处
        </Button>
        <span className="text-xs text-muted-foreground">{chunkCount} 处差异</span>
        <Button
          size="sm"
          onClick={() => {
            if (view.current) onSave?.(view.current.state.doc.toString());
          }}
          disabled={!onSave}
        >
          保存到内容库
        </Button>
      </div>
      <div
        ref={host}
        data-testid="content-merge-editor"
        className="max-h-[28rem] overflow-auto rounded-2xl bg-muted/46 text-xs"
      />
    </div>
  );
}
