import { EditorView } from "@codemirror/view";

/**
 * CodeMirror surface for the merge editors. Colors come from the admin theme
 * variables, so both light and dark themes are handled without reconfiguring.
 */
export const mergeEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "0.75rem",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    padding: "0.25rem 0",
  },
  ".cm-line": { paddingRight: "0.75rem" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
    borderRight: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklch, var(--foreground) 5%, transparent)",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 28%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklch, var(--primary) 34%, transparent)",
  },
  ".cm-merge-conflict": {
    backgroundColor: "color-mix(in oklch, var(--warning) 18%, transparent)",
  },
  ".cm-changedLine, .cm-inlineChangedLine": {
    backgroundColor: "color-mix(in oklch, var(--warning) 16%, transparent)",
  },
  ".cm-changedText": {
    backgroundColor: "color-mix(in oklch, var(--warning) 34%, transparent)",
  },
  ".cm-deletedLine, .cm-deletedChunk": {
    backgroundColor: "color-mix(in oklch, var(--destructive) 14%, transparent)",
  },
  ".cm-deletedText, .cm-deletedLine del": {
    backgroundColor: "color-mix(in oklch, var(--destructive) 30%, transparent)",
    color: "color-mix(in oklch, var(--destructive) 72%, var(--foreground))",
  },
  ".cm-insertedLine": {
    backgroundColor: "color-mix(in oklch, var(--success) 16%, transparent)",
  },
  ".cm-changedLineGutter": {
    backgroundColor: "color-mix(in oklch, var(--warning) 28%, transparent)",
  },
  ".cm-deletedLineGutter": {
    backgroundColor: "color-mix(in oklch, var(--destructive) 28%, transparent)",
  },
  "& .cm-collapsedLines": {
    color: "var(--muted-foreground)",
    backgroundColor: "color-mix(in oklch, var(--muted) 70%, transparent)",
    backgroundImage: "none",
    borderColor: "var(--border)",
  },
  ".cm-merge-revert button": {
    color: "var(--foreground)",
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
  },
  ".cm-mergeViewEditors": { color: "var(--foreground)" },
  ".cm-mergeViewEditor + .cm-mergeViewEditor": { borderLeft: "1px solid var(--border)" },
});
