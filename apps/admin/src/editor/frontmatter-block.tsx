import {
  autocompletion,
  type CompletionContext,
  closeBrackets,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml as yamlLanguage } from "@codemirror/lang-yaml";
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  placeholder as editorPlaceholder,
  keymap,
  WidgetType,
} from "@codemirror/view";
import { FileJson2, TriangleAlert } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  FrontmatterDiagnostic,
  FrontmatterSuggestionSource,
} from "@/lib/frontmatter-document";
import {
  getFrontmatterFieldDefinitions,
  getRecommendedFrontmatterDateString,
  splitFrontmatterDiagnosticMessage,
  validateFrontmatterText,
} from "@/lib/frontmatter-document";

type FrontmatterBlockProps = {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  readOnly?: boolean;
  diagnostics?: FrontmatterDiagnostic[];
  suggestions?: FrontmatterSuggestionSource;
};

type InlineDiagnosticTooltipState = {
  diagnostics: FrontmatterDiagnostic[];
  severity: "error" | "warning";
  style: CSSProperties;
  title: string;
};

type InlineDiagnosticHoverDetail = {
  indexes: number[];
  severity: "error" | "warning";
  rect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
};

const FIELD_DEFINITIONS = getFrontmatterFieldDefinitions();
const BOOLEAN_FIELDS = new Set(["draft", "public"]);
const DATE_FIELDS = new Set(["publishDate", "updateDate", "date"]);
const ERROR_WAVE_IMAGE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='6' viewBox='0 0 12 6'%3E%3Cpath d='M0 4 Q1.5 0 3 4 T6 4 T9 4 T12 4' fill='none' stroke='%23e11d48' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`;
const WARNING_WAVE_IMAGE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='6' viewBox='0 0 12 6'%3E%3Cpath d='M0 4 Q1.5 0 3 4 T6 4 T9 4 T12 4' fill='none' stroke='%23f59e0b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`;
const WARNING_ICON_IMAGE =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' ` +
  `viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2' ` +
  `stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath ` +
  `d='m10.29 3.86-7.5 13A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.71-3l-7.5-13a2 2 0 0 0-3.42 0Z'/%3E` +
  `%3Cline x1='12' x2='12' y1='9' y2='13'/%3E%3Cline x1='12' x2='12.01' y1='17' y2='17'/%3E` +
  `%3C/svg%3E")`;
const ERROR_ICON_IMAGE =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' ` +
  `viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2' ` +
  `stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E` +
  `%3Cpath d='m15 9-6 6'/%3E%3Cpath d='m9 9 6 6'/%3E%3C/svg%3E")`;
const INLINE_DIAGNOSTIC_EVENT = "frontmatter-diagnostic-hover";
const INLINE_DIAGNOSTIC_CLEAR_EVENT = "frontmatter-diagnostic-leave";
const EMPTY_FRONTMATTER_MIN_HEIGHT = 96;

function buildContentAttributes(readOnly: boolean) {
  return {
    "aria-label": "Frontmatter YAML editor",
    role: "textbox",
    "aria-multiline": "true",
    "aria-readonly": readOnly ? "true" : "false",
    tabindex: "0",
  };
}

function syncFrontmatterEditorHeight(view: EditorView) {
  const scroller = view.scrollDOM;
  scroller.style.height = "auto";
  view.dom.style.height = "auto";

  const hasContent = view.state.doc.length > 0;
  const nextHeight = Math.max(
    Math.ceil(view.contentHeight),
    Math.ceil(scroller.scrollHeight),
    hasContent ? 0 : EMPTY_FRONTMATTER_MIN_HEIGHT
  );

  scroller.style.height = `${nextHeight}px`;
  view.dom.style.height = `${nextHeight}px`;

  if (scroller.scrollHeight <= scroller.clientHeight + 1 && scroller.scrollTop !== 0) {
    scroller.scrollTop = 0;
  }
}

function buildYamlTheme() {
  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      fontSize: "0.875rem",
      lineHeight: "1.5rem",
    },
    ".cm-scroller": {
      overflow: "hidden",
      fontFamily:
        "ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
    },
    ".cm-content": {
      padding: "0.75rem 1rem",
      minHeight: "0",
      caretColor: "var(--foreground)",
      userSelect: "text",
      WebkitUserSelect: "text",
    },
    ".cm-line": {
      paddingRight: "1.75rem",
      position: "relative",
      userSelect: "text",
      WebkitUserSelect: "text",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      borderRadius: "1rem",
      border: "1px solid color-mix(in oklch, var(--border) 70%, transparent)",
      backgroundColor: "color-mix(in oklch, var(--card) 97%, transparent)",
      boxShadow: "0 18px 40px -28px rgba(15, 23, 42, 0.7)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete ul": {
      fontFamily: "inherit",
    },
    ".cm-tooltip-autocomplete li[aria-selected]": {
      backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)",
      color: "var(--foreground)",
    },
    ".cm-frontmatter-diagnosticLine-error, .cm-frontmatter-diagnosticLine-warning": {
      position: "relative",
      borderLeft: "0 solid transparent",
    },
    ".cm-frontmatter-diagnosticLineMarker": {
      position: "absolute",
      top: "50%",
      right: "0.35rem",
      display: "inline-block",
      width: "0.95rem",
      height: "0.95rem",
      transform: "translateY(-50%)",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundSize: "contain",
      pointerEvents: "auto",
      opacity: "0.92",
      cursor: "help",
      userSelect: "none",
      zIndex: "1",
    },
    ".cm-frontmatter-diagnosticLine-error": {
      backgroundColor: "color-mix(in oklch, var(--destructive) 4%, transparent)",
    },
    ".cm-frontmatter-diagnosticLine-warning": {
      backgroundColor: "color-mix(in oklch, var(--warning) 5%, transparent)",
    },
    ".cm-frontmatter-diagnosticLineMarker-error": {
      backgroundImage: ERROR_ICON_IMAGE,
    },
    ".cm-frontmatter-diagnosticLineMarker-warning": {
      backgroundImage: WARNING_ICON_IMAGE,
    },
    ".cm-frontmatter-diagnosticMark-error, .cm-frontmatter-diagnosticMark-warning": {
      borderRadius: "0.16rem",
      boxDecorationBreak: "clone",
      WebkitBoxDecorationBreak: "clone",
      backgroundPosition: "left calc(100% - 0px)",
      backgroundRepeat: "repeat-x",
      backgroundSize: "12px 6px",
      paddingBottom: "0.18rem",
      cursor: "help",
    },
    ".cm-frontmatter-diagnosticMark-error": {
      backgroundColor: "color-mix(in oklch, var(--destructive) 5%, transparent)",
      backgroundImage: ERROR_WAVE_IMAGE,
    },
    ".cm-frontmatter-diagnosticMark-warning": {
      backgroundColor: "color-mix(in oklch, var(--warning) 6%, transparent)",
      backgroundImage: WARNING_WAVE_IMAGE,
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-selectionBackground": {
      backgroundColor: "color-mix(in oklch, var(--primary) 20%, transparent) !important",
    },
  });
}

function dedupeValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function findParentFieldAtLine(text: string, lineFrom: number) {
  const lines = text.split("\n");
  let offset = 0;
  const targetLine = lines.findIndex((line) => {
    const currentFrom = offset;
    offset += line.length + 1;
    return currentFrom === lineFrom;
  });

  if (targetLine <= 0) return null;

  for (let index = targetLine - 1; index >= 0; index -= 1) {
    const candidate = lines[index];
    const match = candidate.match(/^([A-Za-z0-9_-]+)\s*:\s*$/);
    if (match) {
      return match[1];
    }
    if (/^\S/.test(candidate)) {
      break;
    }
  }

  return null;
}

function getCompletionContextInfo(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  const beforeCursor = line.text.slice(0, pos - line.from);
  const keyMatch = beforeCursor.match(/^(\s*)([A-Za-z0-9_-]*)$/);
  const valueMatch = beforeCursor.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
  const listItemMatch = beforeCursor.match(/^(\s*)-\s*([^\n]*)$/);
  const parentField = findParentFieldAtLine(state.doc.toString(), line.from);

  return {
    line,
    beforeCursor,
    keyMatch,
    valueMatch,
    listItemMatch,
    parentField,
  };
}

function buildFieldOptions() {
  const fieldOptions = FIELD_DEFINITIONS.map((field) => ({
    label: field.key,
    type: "property" as const,
    detail: field.description,
    apply: `${field.placeholder}`,
  }));

  return fieldOptions.concat([
    {
      label: "date",
      type: "property" as const,
      detail: "Legacy compatibility-only publish date field",
      apply: `date: ${getRecommendedFrontmatterDateString()}`,
    },
  ]);
}

function createContextualCompletionSource(suggestions: FrontmatterSuggestionSource = {}) {
  const fieldOptions = buildFieldOptions();
  const tagValues = dedupeValues(suggestions.tags ?? []);
  const categoryValues = dedupeValues(suggestions.categories ?? []);

  return (context: CompletionContext) => {
    const info = getCompletionContextInfo(context.state, context.pos);

    if (info.listItemMatch && info.parentField === "tags") {
      const current = info.listItemMatch[2] ?? "";
      return {
        from: context.pos - current.length,
        options: tagValues.map((value) => ({
          label: value,
          type: "text" as const,
        })),
      };
    }

    if (info.valueMatch) {
      const field = info.valueMatch[2];
      const current = info.valueMatch[3] ?? "";

      if (BOOLEAN_FIELDS.has(field)) {
        return {
          from: context.pos - current.length,
          options: ["true", "false"].map((value) => ({
            label: value,
            type: "constant" as const,
          })),
        };
      }

      if (field === "createdVia" || field === "updatedVia") {
        return {
          from: context.pos - current.length,
          options: ["demo", "mcp"].map((value) => ({
            label: value,
            type: "constant" as const,
          })),
        };
      }

      if (field === "category") {
        return {
          from: context.pos - current.length,
          options: categoryValues.map((value) => ({
            label: value,
            type: "text" as const,
          })),
        };
      }

      if (DATE_FIELDS.has(field)) {
        return {
          from: context.pos - current.length,
          options: [
            {
              label: getRecommendedFrontmatterDateString(),
              type: "constant" as const,
              detail: field === "date" ? "Legacy compatibility field" : "Recommended date format",
            },
          ],
        };
      }

      return null;
    }

    if (info.keyMatch && (context.explicit || info.keyMatch[2].length > 0)) {
      const current = info.keyMatch[2] ?? "";
      const options = fieldOptions.filter((option) =>
        option.label.toLowerCase().startsWith(current.toLowerCase())
      );
      if (options.length === 0 && !context.explicit) {
        return null;
      }
      return {
        from: context.pos - current.length,
        options,
      };
    }

    return null;
  };
}

const setLineDiagnosticsEffect = StateEffect.define<FrontmatterDiagnostic[]>();

class DiagnosticLineMarkerWidget extends WidgetType {
  constructor(
    private readonly severity: "error" | "warning",
    private readonly diagnosticIndexes: number[]
  ) {
    super();
  }

  eq(other: DiagnosticLineMarkerWidget) {
    return (
      other.severity === this.severity &&
      other.diagnosticIndexes.join(",") === this.diagnosticIndexes.join(",")
    );
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = `cm-frontmatter-diagnosticLineMarker cm-frontmatter-diagnosticLineMarker-${this.severity}`;
    marker.dataset.frontmatterDiagnosticLineEnd = this.severity;
    marker.dataset.frontmatterDiagnosticIndexes = this.diagnosticIndexes.join(",");
    marker.dataset.frontmatterDiagnosticSeverity = this.severity;
    marker.setAttribute("aria-hidden", "true");
    marker.addEventListener("mouseenter", () => {
      const rect = marker.getBoundingClientRect();
      marker.dispatchEvent(
        new CustomEvent<InlineDiagnosticHoverDetail>(INLINE_DIAGNOSTIC_EVENT, {
          bubbles: true,
          detail: {
            indexes: [...this.diagnosticIndexes],
            severity: this.severity,
            rect: {
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
            },
          },
        })
      );
    });
    marker.addEventListener("mouseleave", () => {
      marker.dispatchEvent(new CustomEvent(INLINE_DIAGNOSTIC_CLEAR_EVENT, { bubbles: true }));
    });
    return marker;
  }

  ignoreEvent() {
    return true;
  }
}

function buildLineDiagnosticDecorations(state: EditorState, diagnostics: FrontmatterDiagnostic[]) {
  const decorations: ReturnType<Decoration["range"]>[] = [];
  const lineMarkers = new Map<
    number,
    {
      from: number;
      to: number;
      severity: "error" | "warning";
      indexes: number[];
      messages: string[];
    }
  >();

  for (const [index, diagnostic] of diagnostics.entries()) {
    const from = Math.min(
      Math.max(typeof diagnostic.from === "number" ? diagnostic.from : 0, 0),
      state.doc.length
    );
    const to = Math.min(
      Math.max(typeof diagnostic.to === "number" ? diagnostic.to : from, from),
      state.doc.length
    );
    const line = state.doc.lineAt(from);
    const lineNumber = line.number;
    const existing = lineMarkers.get(lineNumber);

    if (to > from) {
      decorations.push(
        Decoration.mark({
          attributes: {
            class:
              diagnostic.severity === "error"
                ? "cm-frontmatter-diagnosticMark-error"
                : "cm-frontmatter-diagnosticMark-warning",
            "data-frontmatter-diagnostic-mark": diagnostic.severity,
            "data-frontmatter-diagnostic-indexes": String(index),
            "data-frontmatter-diagnostic-severity": diagnostic.severity,
          },
        }).range(from, to)
      );
    }

    if (!existing) {
      lineMarkers.set(lineNumber, {
        from: line.from,
        to: line.to,
        severity: diagnostic.severity,
        messages: [diagnostic.message],
        indexes: [index],
      });
    } else {
      existing.to = Math.max(existing.to, line.to);
      existing.messages.push(diagnostic.message);
      existing.indexes.push(index);
      if (diagnostic.severity === "error") {
        existing.severity = "error";
      }
    }
  }

  for (const marker of lineMarkers.values()) {
    decorations.push(
      Decoration.line({
        attributes: {
          class:
            marker.severity === "error"
              ? "cm-frontmatter-diagnosticLine-error"
              : "cm-frontmatter-diagnosticLine-warning",
          "data-frontmatter-diagnostic-line": marker.severity,
        },
      }).range(marker.from)
    );
    decorations.push(
      Decoration.widget({
        side: 1,
        widget: new DiagnosticLineMarkerWidget(marker.severity, marker.indexes),
      }).range(marker.to)
    );
  }

  return Decoration.set(decorations, true);
}

const lineDiagnosticsField = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setLineDiagnosticsEffect)) {
        return buildLineDiagnosticDecorations(transaction.state, effect.value);
      }
    }

    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function createLineDiagnosticsExtension(initialDiagnostics: FrontmatterDiagnostic[]): Extension[] {
  void initialDiagnostics;
  return [lineDiagnosticsField];
}

function shouldAutoOpenCompletion(state: EditorState, position: number) {
  const info = getCompletionContextInfo(state, position);

  if (
    info.listItemMatch &&
    info.parentField === "tags" &&
    info.listItemMatch[2].trim().length > 0
  ) {
    return true;
  }

  if (info.valueMatch) {
    const field = info.valueMatch[2];
    return (
      BOOLEAN_FIELDS.has(field) ||
      field === "createdVia" ||
      field === "updatedVia" ||
      field === "category" ||
      DATE_FIELDS.has(field)
    );
  }

  return Boolean(info.keyMatch?.[2]?.length);
}

function getDiagnosticKey(diagnostic: FrontmatterDiagnostic) {
  return `${diagnostic.field ?? "root"}:${diagnostic.message}:${diagnostic.from ?? 0}:${diagnostic.to ?? 0}`;
}

function getInlineTooltipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>("[data-frontmatter-diagnostic-indexes]");
}

function parseDiagnosticIndexes(indexesValue: string | undefined) {
  if (!indexesValue) return [];
  return indexesValue
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function getInlineTooltipSeverity(diagnostics: FrontmatterDiagnostic[]) {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "error" : "warning";
}

function buildDiagnosticTooltipStyle(
  rect: { top: number; left: number; right: number; bottom: number },
  options?: { align?: "start" | "end" }
) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.min(352, Math.max(220, viewportWidth - 24));
  const showAbove = rect.bottom + 170 > viewportHeight && rect.top > 140;
  const align = options?.align ?? "start";
  const preferredLeft = align === "end" ? rect.right - maxWidth : rect.left;
  const left = Math.max(12, Math.min(preferredLeft, viewportWidth - maxWidth - 12));

  return {
    position: "fixed" as const,
    top: showAbove ? rect.top - 10 : rect.bottom + 10,
    left,
    maxWidth: `${maxWidth}px`,
    transform: showAbove ? "translateY(-100%)" : undefined,
  };
}

function buildInlineTooltipState(
  target: HTMLElement,
  diagnostics: FrontmatterDiagnostic[]
): InlineDiagnosticTooltipState | null {
  if (diagnostics.length === 0) return null;
  const rect = target.getBoundingClientRect();

  return {
    diagnostics,
    severity: getInlineTooltipSeverity(diagnostics),
    title: diagnostics.length > 1 ? "错误详情" : "行内错误",
    style: buildDiagnosticTooltipStyle(rect),
  };
}

function buildSummaryTooltipState(
  target: HTMLElement,
  severity: "error" | "warning",
  diagnostics: FrontmatterDiagnostic[]
): InlineDiagnosticTooltipState | null {
  if (diagnostics.length === 0) return null;
  const rect = target.getBoundingClientRect();

  return {
    diagnostics,
    severity,
    title: severity === "error" ? "错误详情" : "警告详情",
    style: buildDiagnosticTooltipStyle(rect, { align: "end" }),
  };
}

function buildInlineTooltipStateFromDetail(
  detail: InlineDiagnosticHoverDetail,
  diagnostics: FrontmatterDiagnostic[]
): InlineDiagnosticTooltipState | null {
  if (diagnostics.length === 0) return null;

  return {
    diagnostics,
    severity: detail.severity,
    title: diagnostics.length > 1 ? "错误详情" : "行内错误",
    style: buildDiagnosticTooltipStyle(detail.rect),
  };
}

function DiagnosticMessage({ message }: { message: string }) {
  const { summary, detail } = splitFrontmatterDiagnosticMessage(message);

  return (
    <div className="space-y-1.5">
      <div className="text-pretty text-muted-foreground">{summary}</div>
      {detail ? (
        <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/28 px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground/88 whitespace-pre-wrap">
          {detail}
        </pre>
      ) : null}
    </div>
  );
}

function InlineDiagnosticTooltip({ tooltip }: { tooltip: InlineDiagnosticTooltipState | null }) {
  if (!tooltip || typeof document === "undefined") return null;

  const toneClass =
    tooltip.severity === "error"
      ? "border-destructive/35 shadow-[0_18px_40px_-28px_color-mix(in_oklch,var(--destructive)_55%,transparent)]"
      : "border-amber-400/35 shadow-[0_18px_40px_-28px_color-mix(in_oklch,var(--warning)_40%,transparent)]";

  return createPortal(
    <div
      role="tooltip"
      data-testid="frontmatter-diagnostic-tooltip"
      className={`pointer-events-none z-[70] rounded-[1rem] border bg-card/96 px-3 py-2 text-[11px] leading-5 text-foreground shadow-xl backdrop-blur-sm ${toneClass}`}
      style={tooltip.style}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <TriangleAlert
          className={`size-3.5 shrink-0 ${tooltip.severity === "error" ? "text-destructive" : "text-amber-500 dark:text-amber-300"}`}
          aria-hidden="true"
        />
        <span className="font-medium text-foreground">{tooltip.title}</span>
      </div>
      <div className="space-y-1.5">
        {tooltip.diagnostics.map((diagnostic, index) => (
          <div
            key={getDiagnosticKey(diagnostic)}
            className={index === 0 ? "" : "border-t border-border/60 pt-1.5"}
          >
            <DiagnosticMessage message={diagnostic.message} />
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

function DiagnosticMarker({
  severity,
  diagnostics,
  onHoverChange,
}: {
  severity: "error" | "warning";
  diagnostics: FrontmatterDiagnostic[];
  onHoverChange: (target: HTMLElement | null, severity: "error" | "warning") => void;
}) {
  if (diagnostics.length === 0) return null;

  const isError = severity === "error";
  const label = isError ? "错误" : "警告";

  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
        isError
          ? "border-destructive/35 bg-destructive/10 text-destructive"
          : "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      }`}
      aria-label={`${diagnostics.length} 个${label}`}
      data-testid={`frontmatter-diagnostics-${severity}`}
      onMouseEnter={(event) => onHoverChange(event.currentTarget, severity)}
      onMouseLeave={() => onHoverChange(null, severity)}
      onFocus={(event) => onHoverChange(event.currentTarget, severity)}
      onBlur={() => onHoverChange(null, severity)}
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{diagnostics.length}</span>
    </button>
  );
}

export function FrontmatterBlock({
  value,
  onChange,
  className = "",
  readOnly = false,
  diagnostics,
  suggestions,
}: FrontmatterBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const hoveredDiagnosticTargetRef = useRef<HTMLElement | null>(null);
  const changeHandlerRef = useRef(onChange);
  const diagnosticsRef = useRef(diagnostics ?? validateFrontmatterText(value).diagnostics);
  const suggestionsRef = useRef(suggestions);
  const initialValueRef = useRef(value);
  const syncingRef = useRef(false);
  const lineDiagnosticsCompartment = useRef(new Compartment()).current;
  const completionCompartment = useRef(new Compartment()).current;
  const readOnlyCompartment = useRef(new Compartment()).current;
  const accessibilityCompartment = useRef(new Compartment()).current;
  const theme = useMemo(() => buildYamlTheme(), []);
  const [inlineTooltip, setInlineTooltip] = useState<InlineDiagnosticTooltipState | null>(null);

  const effectiveDiagnostics = useMemo(
    () => diagnostics ?? validateFrontmatterText(value).diagnostics,
    [diagnostics, value]
  );
  const errorDiagnostics = useMemo(
    () => effectiveDiagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [effectiveDiagnostics]
  );
  const warningDiagnostics = useMemo(
    () => effectiveDiagnostics.filter((diagnostic) => diagnostic.severity === "warning"),
    [effectiveDiagnostics]
  );
  const hasDiagnostics = errorDiagnostics.length > 0 || warningDiagnostics.length > 0;

  useEffect(() => {
    changeHandlerRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    diagnosticsRef.current = effectiveDiagnostics;
  }, [effectiveDiagnostics]);

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const completionSource = createContextualCompletionSource(suggestionsRef.current);

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        drawSelection(),
        history(),
        closeBrackets(),
        yamlLanguage(),
        accessibilityCompartment.of(
          EditorView.contentAttributes.of(buildContentAttributes(readOnly))
        ),
        editorPlaceholder("title: Example Post\nslug: example-post\npublishDate: 2026-06-17"),
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: "Mod-Space",
            run: () => {
              const view = viewRef.current;
              if (!view) return false;
              return startCompletion(view);
            },
          },
        ]),
        completionCompartment.of(
          autocompletion({
            activateOnTyping: true,
            override: [completionSource],
          })
        ),
        lineDiagnosticsCompartment.of(createLineDiagnosticsExtension(diagnosticsRef.current)),
        readOnlyCompartment.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextValue = update.state.doc.toString();
            if (!syncingRef.current) {
              changeHandlerRef.current?.(nextValue);
              const selection = update.state.selection.main;
              if (
                selection.empty &&
                completionStatus(update.state) !== "active" &&
                shouldAutoOpenCompletion(update.state, selection.head)
              ) {
                requestAnimationFrame(() => {
                  startCompletion(update.view);
                });
              }
            }
          }
          requestAnimationFrame(() => {
            syncFrontmatterEditorHeight(update.view);
          });
        }),
        theme,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;
    syncFrontmatterEditorHeight(view);
    view.dispatch({
      effects: setLineDiagnosticsEffect.of(diagnosticsRef.current),
    });

    const resizeObserver = new ResizeObserver(() => {
      syncFrontmatterEditorHeight(view);
    });
    resizeObserver.observe(view.dom);

    return () => {
      resizeObserver.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, [
    completionCompartment,
    lineDiagnosticsCompartment,
    readOnlyCompartment,
    accessibilityCompartment,
    theme,
    readOnly,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current !== value) {
      syncingRef.current = true;
      view.dispatch({
        changes: {
          from: 0,
          to: current.length,
          insert: value,
        },
        selection: EditorSelection.cursor(Math.min(view.state.selection.main.head, value.length)),
      });
      syncingRef.current = false;
      requestAnimationFrame(() => {
        syncFrontmatterEditorHeight(view);
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: [
        completionCompartment.reconfigure(
          autocompletion({
            activateOnTyping: true,
            override: [createContextualCompletionSource(suggestions)],
          })
        ),
        lineDiagnosticsCompartment.reconfigure(
          createLineDiagnosticsExtension(effectiveDiagnostics)
        ),
        accessibilityCompartment.reconfigure(
          EditorView.contentAttributes.of(buildContentAttributes(readOnly))
        ),
        readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        setLineDiagnosticsEffect.of(effectiveDiagnostics),
      ],
    });
    requestAnimationFrame(() => {
      syncFrontmatterEditorHeight(view);
    });
  }, [
    completionCompartment,
    lineDiagnosticsCompartment,
    readOnlyCompartment,
    accessibilityCompartment,
    effectiveDiagnostics,
    readOnly,
    suggestions,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateTooltipTarget = (target: EventTarget | null) => {
      const nextTarget = getInlineTooltipTarget(target);
      if (nextTarget === hoveredDiagnosticTargetRef.current) return;

      hoveredDiagnosticTargetRef.current = nextTarget;

      if (!nextTarget) {
        setInlineTooltip((current) => (current ? null : current));
        return;
      }

      const diagnostics = parseDiagnosticIndexes(nextTarget.dataset.frontmatterDiagnosticIndexes)
        .map((index) => effectiveDiagnostics[index])
        .filter((diagnostic): diagnostic is FrontmatterDiagnostic => Boolean(diagnostic));

      setInlineTooltip(buildInlineTooltipState(nextTarget, diagnostics));
    };

    const handleMouseOver = (event: MouseEvent) => {
      updateTooltipTarget(event.target);
    };

    const handleInlineDiagnosticHover = (event: Event) => {
      const customEvent = event as CustomEvent<InlineDiagnosticHoverDetail>;
      hoveredDiagnosticTargetRef.current = null;
      const diagnostics = customEvent.detail.indexes
        .map((index) => effectiveDiagnostics[index])
        .filter((diagnostic): diagnostic is FrontmatterDiagnostic => Boolean(diagnostic));
      setInlineTooltip(buildInlineTooltipStateFromDetail(customEvent.detail, diagnostics));
    };

    const handleFocusIn = (event: FocusEvent) => {
      updateTooltipTarget(event.target);
    };

    const handleMouseOut = (event: MouseEvent) => {
      const nextTarget = getInlineTooltipTarget(event.relatedTarget);
      if (nextTarget) {
        updateTooltipTarget(nextTarget);
        return;
      }
      hoveredDiagnosticTargetRef.current = null;
      setInlineTooltip(null);
    };

    const handleMouseLeave = () => {
      hoveredDiagnosticTargetRef.current = null;
      setInlineTooltip(null);
    };

    const handleFocusOut = () => {
      hoveredDiagnosticTargetRef.current = null;
      setInlineTooltip(null);
    };

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("mouseout", handleMouseOut);
    container.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("focusout", handleFocusOut);
    container.addEventListener(
      INLINE_DIAGNOSTIC_EVENT,
      handleInlineDiagnosticHover as EventListener
    );
    container.addEventListener(INLINE_DIAGNOSTIC_CLEAR_EVENT, handleMouseLeave as EventListener);

    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("mouseout", handleMouseOut);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("focusout", handleFocusOut);
      container.removeEventListener(
        INLINE_DIAGNOSTIC_EVENT,
        handleInlineDiagnosticHover as EventListener
      );
      container.removeEventListener(
        INLINE_DIAGNOSTIC_CLEAR_EVENT,
        handleMouseLeave as EventListener
      );
    };
  }, [effectiveDiagnostics]);

  useEffect(() => {
    if (!inlineTooltip) return;

    const handleViewportChange = () => {
      hoveredDiagnosticTargetRef.current = null;
      setInlineTooltip(null);
    };

    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [inlineTooltip]);

  const handleSummaryHoverChange = (target: HTMLElement | null, severity: "error" | "warning") => {
    hoveredDiagnosticTargetRef.current = null;

    if (!target) {
      setInlineTooltip(null);
      return;
    }

    const nextDiagnostics = severity === "error" ? errorDiagnostics : warningDiagnostics;
    setInlineTooltip(buildSummaryTooltipState(target, severity, nextDiagnostics));
  };

  return (
    <>
      <section
        className={`rounded-[1.35rem] border border-border/55 bg-background/58 shadow-sm shadow-black/5 transition-colors focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_18%,transparent)] ${className}`}
        data-testid="frontmatter-block"
        data-frontmatter-readonly={readOnly ? "true" : "false"}
      >
        <div
          className="relative flex items-center gap-2 border-b border-border/55 px-4 py-3 pr-24 text-sm text-muted-foreground"
          data-testid="frontmatter-block-header"
        >
          <FileJson2 className="size-4 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground">Frontmatter</span>
          <span>YAML metadata</span>
          {hasDiagnostics ? (
            <div className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-2">
              <DiagnosticMarker
                severity="error"
                diagnostics={errorDiagnostics}
                onHoverChange={handleSummaryHoverChange}
              />
              <DiagnosticMarker
                severity="warning"
                diagnostics={warningDiagnostics}
                onHoverChange={handleSummaryHoverChange}
              />
            </div>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-b-[1.35rem] bg-background/44">
          <div className="border-b border-border/45 px-4 py-2 font-mono text-xs text-muted-foreground/88">
            ---
          </div>
          <div
            ref={containerRef}
            className="frontmatter-codemirror"
            data-frontmatter-readonly={readOnly ? "true" : "false"}
          />
          <div className="border-t border-border/45 px-4 py-2 font-mono text-xs text-muted-foreground/88">
            ---
          </div>
        </div>
      </section>
      <InlineDiagnosticTooltip tooltip={inlineTooltip} />
    </>
  );
}
