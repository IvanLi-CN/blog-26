import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { formatTechStackRaw } from "@/lib/playbook/tech-stack";

const tokenColors = {
  key: "text-[color:var(--nature-code-function)]",
  string: "text-[color:var(--nature-code-string)]",
  number: "text-[color:var(--nature-code-number)]",
  literal: "text-[color:var(--nature-code-literal)]",
  punctuation: "text-[color:var(--nature-text-soft)]",
};

function HighlightedJson({ source }: { source: string }) {
  // Match entire quoted strings first, so escapes and punctuation inside values stay intact.
  const tokens = source.matchAll(
    /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]|\s+|./g
  );
  return (
    <code className="font-mono text-xs leading-5 text-[color:var(--nature-code-foreground)]">
      {Array.from(tokens, (token) => {
        const text = token[0];
        const color = text.startsWith('"')
          ? /^\s*:/.test(source.slice(token.index + text.length))
            ? tokenColors.key
            : tokenColors.string
          : /^-?\d/.test(text)
            ? tokenColors.number
            : /^(true|false|null)$/.test(text)
              ? tokenColors.literal
              : /^[{}[\],:]$/.test(text)
                ? tokenColors.punctuation
                : undefined;
        return color ? (
          <span key={token.index} className={color}>
            {text}
          </span>
        ) : (
          text
        );
      })}
    </code>
  );
}

const buttonClassName =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[color:var(--nature-text-soft)] transition-colors hover:bg-[rgba(var(--nature-accent-rgb),0.1)] hover:text-[color:var(--nature-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent)]";

export default function PlaybookTechStackRaw({ value }: { value: unknown }) {
  const raw = formatTechStackRaw(value);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const positionRef = useRef({ height: 0, top: 0, left: 0 });
  const restoreFocusRef = useRef(false);

  const setFullscreen = (open: boolean) => {
    const scroller = scrollerRef.current;
    if (scroller) {
      positionRef.current.top = scroller.scrollTop;
      positionRef.current.left = scroller.scrollLeft;
    }
    if (open) positionRef.current.height = viewerRef.current?.getBoundingClientRect().height ?? 0;
    restoreFocusRef.current = true;
    setExpanded(open);
  };

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTop = positionRef.current.top;
      scroller.scrollLeft = positionRef.current.left;
    }
    if (!expanded && restoreFocusRef.current)
      expandButtonRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const bodyOverflow = document.body.style.overflow;
    const pageOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
    expandButtonRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = pageOverflow;
    };
  }, [expanded]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const copyRaw = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
        setCopyState("copied");
        return;
      }
    } catch {
      // Continue to the textarea fallback when browser clipboard permission is unavailable.
    }
    const textarea = document.createElement("textarea");
    textarea.value = raw;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (copied) {
      setCopyState("copied");
      return;
    }
    setCopyState("failed");
    scrollerRef.current?.focus({ preventScroll: true });
    const selection = window.getSelection();
    const code = scrollerRef.current?.querySelector("code");
    if (selection && code) {
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const copyLabel =
    copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败，请手动复制" : "复制";
  const viewer = (
    <div
      ref={viewerRef}
      className={`flex min-w-0 flex-col overflow-hidden rounded-md bg-[rgba(var(--nature-accent-rgb),0.07)] ${expanded ? "h-full" : ""}`}
      data-tech-stack-raw-viewer
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--nature-line)] px-3">
        <span className="font-mono text-xs text-[color:var(--nature-text-soft)]">JSON</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyRaw}
            className={buttonClassName}
            aria-label="复制原始数据"
            title="复制原始数据"
          >
            <Icon
              name={copyState === "copied" ? "tabler:check" : "tabler:copy"}
              className="h-4 w-4 shrink-0"
            />
            <span role="status">{copyLabel}</span>
          </button>
          <button
            ref={expandButtonRef}
            type="button"
            onClick={() => setFullscreen(!expanded)}
            className={buttonClassName}
            aria-label={expanded ? "退出全屏" : "全屏查看原始数据"}
            aria-expanded={expanded}
            title={expanded ? "退出全屏 (Esc)" : "全屏查看原始数据"}
          >
            <Icon
              name={expanded ? "tabler:arrows-minimize" : "tabler:arrows-maximize"}
              className="h-4 w-4 shrink-0"
            />
            {expanded ? "退出全屏" : "全屏"}
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the code region.
        tabIndex={0}
        className={`min-h-0 max-w-full overflow-auto outline-none selection:bg-[rgba(var(--nature-accent-rgb),0.28)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--nature-accent)] ${expanded ? "flex-1" : "max-h-80"}`}
        role="document"
        aria-label="原始技术栈 JSON"
      >
        <pre className="m-0 whitespace-pre-wrap px-3 py-2.5 [overflow-wrap:anywhere]">
          <HighlightedJson source={raw} />
        </pre>
      </div>
    </div>
  );

  return (
    <>
      {expanded ? <div style={{ height: positionRef.current.height }} /> : viewer}
      <dialog
        ref={dialogRef}
        aria-label="原始技术栈数据全屏视图"
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[color:var(--nature-bg)] p-3 text-[color:var(--nature-text)] sm:p-5"
        onClose={() => setFullscreen(false)}
      >
        {expanded ? viewer : null}
      </dialog>
    </>
  );
}
