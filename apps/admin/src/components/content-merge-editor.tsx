import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { getChunks, goToNextChunk, goToPreviousChunk, unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui";

export interface ContentMergeEditorProps {
  /** Document kept in the content library. */
  localText: string;
  /** Document currently stored in the repository. */
  remoteText: string;
  onSave?: (text: string) => void;
}

/**
 * Unified merge view: the editable buffer is the local document, the reference
 * document is the repository version. Chunk accept/reject controls live inside
 * the document; the toolbar only navigates and takes a whole-file version.
 */
export function ContentMergeEditor({ localText, remoteText, onSave }: ContentMergeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const [chunks, setChunks] = useState({ count: 0, index: 0 });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const track = (editor: EditorView) => {
      const list = getChunks(editor.state)?.chunks ?? [];
      const head = editor.state.selection.main.head;
      const found = list.findIndex((chunk) => head <= chunk.toB);
      setChunks({ count: list.length, index: found === -1 ? list.length - 1 : found });
    };
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
            if (update.docChanged || update.selectionSet) track(update.view);
          }),
          unifiedMergeView({
            original: remoteText,
            mergeControls: (type, action) => {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = type === "accept" ? "保留本地" : "采用远端";
              button.className =
                "mr-1 cursor-pointer rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted";
              button.addEventListener("mousedown", action);
              return button;
            },
            collapseUnchanged: { margin: 3, minSize: 4 },
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
  }, [localText, remoteText]);

  function replaceWholeDocument(text: string) {
    const editor = view.current;
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
          onClick={() => view.current && goToPreviousChunk(view.current)}
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
          onClick={() => view.current && goToNextChunk(view.current)}
        >
          ›
        </Button>
        <Button size="sm" variant="outline" onClick={() => replaceWholeDocument(localText)}>
          整篇回到本地
        </Button>
        <Button size="sm" variant="outline" onClick={() => replaceWholeDocument(remoteText)}>
          整篇采用远端
        </Button>
        <Button
          size="sm"
          onClick={() => onSave?.(view.current?.state.doc.toString() ?? "")}
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
