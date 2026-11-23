import { MergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

export interface ContentTextDiffProps {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}

/**
 * Side-by-side text diff rendered by the CodeMirror merge view.
 * The comparison itself belongs to the editor dependency, not to this component.
 */
export function ContentTextDiff({ left, right, leftLabel, rightLabel }: ContentTextDiffProps) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const readOnly = EditorView.editable.of(false);
    const view = new MergeView({
      parent,
      a: { doc: left, extensions: [readOnly] },
      b: { doc: right, extensions: [readOnly] },
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
    });
    return () => view.destroy();
  }, [left, right]);

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {leftLabel} ↔ {rightLabel}
      </p>
      <div
        ref={host}
        data-testid="content-text-diff"
        className="max-h-96 overflow-auto rounded-2xl bg-muted/46 text-xs"
      />
    </div>
  );
}
