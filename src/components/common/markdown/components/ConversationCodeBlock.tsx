"use client";

import type { Element, Root } from "hast";
import {
  createElement,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import rehypeHighlight from "rehype-highlight";
import { unified } from "unified";
import type { ConversationCodeBlockProps } from "../../conversation/types";
import "@/styles/markdown-code.css";

import {
  ConversationPresentationContext,
  type ConversationPresentationStore,
} from "../../conversation/presentation-state";

const highlighter = unified().use(rehypeHighlight, { detect: false, ignoreMissing: true });

/** Only highlighter spans and text become React nodes; code HTML is never interpreted. */
function highlightSource(source: string, language?: string) {
  if (!language) return source;
  try {
    const code: Element = {
      type: "element",
      tagName: "code",
      properties: { className: [`language-${language}`] },
      children: [{ type: "text", value: source }],
    };
    const tree: Root = {
      type: "root",
      children: [{ type: "element", tagName: "pre", properties: {}, children: [code] }],
    };
    highlighter.runSync(tree);
    const renderNodes = (nodes: Element["children"]): React.ReactNode[] =>
      nodes.map((node, index) => {
        if (node.type === "text") return node.value;
        if (node.type !== "element" || node.tagName !== "span") {
          throw new Error("Unexpected code highlight node");
        }
        const classes = node.properties.className;
        return createElement(
          "span",
          { key: index, className: Array.isArray(classes) ? classes.join(" ") : undefined },
          renderNodes(node.children)
        );
      });
    return renderNodes(code.children);
  } catch {
    return source;
  }
}

/** The caller establishes block identity from the Markdown AST/pre, even without a language. */
export function ConversationCodeBlock({ source, language, className }: ConversationCodeBlockProps) {
  const store = useContext(ConversationPresentationContext);
  const root = useRef<HTMLDivElement>(null);
  const persistence = useRef<{ store: ConversationPresentationStore; field: string } | null>(null);
  useLayoutEffect(() => {
    persistence.current = null;
    const element = root.current;
    const message = element?.closest<HTMLElement>("[data-message-id]");
    if (!element || !store || !message) {
      setExpanded(true);
      return;
    }
    const index = Array.from(message.querySelectorAll(".conversation-code-block")).indexOf(element);
    const field = `code:${message.dataset.messageId}:${index}`;
    persistence.current = { store, field };
    const saved = store.read(field);
    setExpanded(typeof saved === "boolean" ? saved : true);
  }, [store]);
  const highlighted = useMemo(() => highlightSource(source, language), [source, language]);
  const [expanded, setExpanded] = useState(true);
  const [copy, setCopy] = useState<{
    source: string;
    status: "copying" | "success" | "error";
  } | null>(null);
  const copyAttempt = useRef(0);
  const contentId = useId();
  const feedbackId = useId();
  const copyStatus = copy?.source === source ? copy.status : null;
  const lines = source === "" ? 0 : source.split("\n").length;

  const copySource = async () => {
    const attempt = ++copyAttempt.current;
    setCopy({ source, status: "copying" });
    try {
      await navigator.clipboard.writeText(source);
      if (attempt === copyAttempt.current) setCopy({ source, status: "success" });
    } catch {
      if (attempt === copyAttempt.current) setCopy({ source, status: "error" });
    }
  };

  return (
    <div
      ref={root}
      data-markdown-surface="public"
      className={["conversation-code-block", className].filter(Boolean).join(" ")}
    >
      <div className="conversation-code-toolbar">
        <span className="conversation-code-language">{language || "代码"}</span>
        <div className="conversation-code-actions">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() =>
              setExpanded((value) => {
                const saved = persistence.current;
                if (saved) saved.store.write(saved.field, !value);
                return !value;
              })
            }
          >
            {expanded ? "折叠代码" : "展开代码"}
          </button>
          <button
            type="button"
            onClick={copySource}
            disabled={copyStatus === "copying"}
            aria-describedby={feedbackId}
          >
            {copyStatus === "copying" ? "正在复制" : "复制代码"}
          </button>
        </div>
      </div>
      <span
        id={feedbackId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="conversation-code-feedback"
      >
        {copyStatus === "success"
          ? "代码已复制"
          : copyStatus === "error"
            ? "复制失败，请重试或手动选择代码复制"
            : ""}
      </span>
      {!expanded && <p className="conversation-code-summary">已折叠 · {lines} 行</p>}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The code viewport must support keyboard scrolling. */}
      <pre id={contentId} hidden={!expanded} tabIndex={0}>
        <code className={language ? `hljs language-${language}` : undefined}>{highlighted}</code>
      </pre>
    </div>
  );
}
