import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { getChunks, goToNextChunk, goToPreviousChunk, unifiedMergeView } from "@codemirror/merge";
import { EditorState, StateEffect, StateField, Text } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, WidgetType } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui";
import { contentLanguageExtension } from "~/editor/merge-editor-language";
import { mergeEditorTheme } from "~/editor/merge-editor-theme";

type Chunk = { fromA: number; toA: number; fromB: number; toB: number };

const chooseLocal = StateEffect.define<string>();

const localChoices = StateField.define<Set<string>>({
  create: () => new Set(),
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (!effect.is(chooseLocal)) continue;
      next = new Set(next);
      next.add(effect.value);
    }
    return next;
  },
});

function chunkKey(chunk: Chunk) {
  return `${chunk.fromA}:${chunk.toA}`;
}

class ChunkControls extends WidgetType {
  constructor(
    private readonly chunk: Chunk,
    private readonly remoteSlice: string,
    private readonly chosenLocal: boolean
  ) {
    super();
  }

  override eq(other: WidgetType) {
    return (
      other instanceof ChunkControls &&
      other.chunk.fromB === this.chunk.fromB &&
      other.chosenLocal === this.chosenLocal
    );
  }

  override ignoreEvent() {
    return false;
  }

  override toDOM() {
    const row = document.createElement("div");
    row.className =
      "cm-merge-actions mb-1 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 shadow-sm";
    row.style.display = "inline-flex";
    row.style.width = "fit-content";
    row.style.maxWidth = "100%";
    const label = document.createElement("span");
    label.textContent = this.chosenLocal ? "这一处差异 · 已采用本地" : "这一处差异";
    label.className = "text-[11px] font-medium text-foreground";
    row.appendChild(label);
    const keepLocal = document.createElement("button");
    keepLocal.type = "button";
    keepLocal.textContent = "采用本地";
    keepLocal.className = this.chosenLocal
      ? "cursor-pointer rounded-md border border-primary/60 bg-primary/20 px-2 py-0.5 text-[11px] font-medium text-foreground"
      : "cursor-pointer rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted/70";
    keepLocal.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const view = (event.currentTarget as HTMLElement).closest(".cm-editor") as HTMLElement | null;
      const target = EditorView.findFromDOM(view);
      target?.dispatch({ effects: chooseLocal.of(chunkKey(this.chunk)) });
    });
    row.appendChild(keepLocal);
    const takeRemote = document.createElement("button");
    takeRemote.type = "button";
    takeRemote.textContent = "采用远端";
    takeRemote.className =
      "cursor-pointer rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-primary/20";
    takeRemote.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const view = (event.currentTarget as HTMLElement).closest(".cm-editor") as HTMLElement | null;
      const target = EditorView.findFromDOM(view);
      target?.dispatch({
        changes: { from: this.chunk.fromB, to: this.chunk.toB, insert: this.remoteSlice },
      });
    });
    row.appendChild(takeRemote);
    return row;
  }
}

function controlsLayer(remote: Text) {
  return EditorView.decorations.compute(["doc", localChoices], (state) => {
    const chosen = state.field(localChoices);
    const chunks = getChunks(state)?.chunks ?? [];
    return Decoration.set(
      chunks.map((chunk) =>
        Decoration.widget({
          widget: new ChunkControls(
            chunk,
            remote.sliceString(chunk.fromA, chunk.toA),
            chosen.has(chunkKey(chunk))
          ),
          side: -1,
          block: true,
        }).range(chunk.fromB)
      ),
      true
    );
  });
}

export interface ContentMergeEditorProps {
  /** Document kept in the content library. */
  localText: string;
  /** Document currently stored in the repository. */
  remoteText: string;
  onSave?: (text: string) => void;
}

/**
 * Unified merge view: the editable buffer is the local document, the reference
 * document is the repository version. Every difference carries its own visible
 * control row inside the document; the toolbar only navigates and takes a
 * whole-file version.
 */
export function ContentMergeEditor({ localText, remoteText, onSave }: ContentMergeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const [chunks, setChunks] = useState({ count: 0, index: 0 });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const remote = Text.of(remoteText.split("\n"));
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
          localChoices,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          controlsLayer(remote),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet || update.transactions.length)
              track(update.view);
          }),
          unifiedMergeView({
            original: remoteText,
            mergeControls: false,
            collapseUnchanged: { margin: 3, minSize: 4 },
          }),
        ],
      }),
    });
    next.dispatch({ effects: StateEffect.appendConfig.of(mergeEditorTheme) });
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
        className="max-h-[28rem] overflow-auto rounded-2xl bg-code-surface text-xs"
      />
    </div>
  );
}
