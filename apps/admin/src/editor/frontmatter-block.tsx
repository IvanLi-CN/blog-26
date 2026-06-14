import { FileJson2 } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

type FrontmatterBlockProps = {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  readOnly?: boolean;
};

export function FrontmatterBlock({
  value,
  onChange,
  className = "",
  readOnly = false,
}: FrontmatterBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  });

  return (
    <section
      className={`rounded-[1.35rem] border border-border/55 bg-background/58 shadow-sm shadow-black/5 transition-colors focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_18%,transparent)] ${className}`}
      data-testid="frontmatter-block"
    >
      <div className="flex items-center gap-2 border-b border-border/55 px-4 py-3 text-sm text-muted-foreground">
        <FileJson2 className="size-4 text-primary" aria-hidden="true" />
        <span className="font-medium text-foreground">Frontmatter</span>
        <span>YAML metadata</span>
      </div>
      <div className="overflow-hidden rounded-b-[1.35rem] bg-background/44">
        <div className="border-b border-border/45 px-4 py-2 font-mono text-xs text-muted-foreground/88">
          ---
        </div>
        <textarea
          ref={textareaRef}
          aria-label="Frontmatter YAML editor"
          value={value}
          onChange={(event) => {
            event.currentTarget.style.height = "0px";
            event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            onChange?.(event.target.value);
          }}
          placeholder={"title: Example Post\nslug: example-post\ndraft: true"}
          spellCheck={false}
          readOnly={readOnly}
          className="min-h-[9rem] w-full resize-none overflow-hidden border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none"
        />
        <div className="border-t border-border/45 px-4 py-2 font-mono text-xs text-muted-foreground/88">
          ---
        </div>
      </div>
    </section>
  );
}
