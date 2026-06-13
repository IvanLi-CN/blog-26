import { FileJson2 } from "lucide-react";

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
  return (
    <section
      className={`rounded-[1.35rem] border border-border/60 bg-muted/34 px-4 py-4 shadow-inner shadow-shadow-inset ${className}`}
      data-testid="frontmatter-block"
    >
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <FileJson2 className="size-4 text-primary" aria-hidden="true" />
        <span className="font-medium text-foreground">Frontmatter</span>
        <span>YAML metadata</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/55 bg-background/72">
        <div className="border-b border-border/55 px-3 py-2 font-mono text-xs text-muted-foreground">
          ---
        </div>
        <textarea
          aria-label="Frontmatter YAML editor"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={"title: Example Post\nslug: example-post\ndraft: true"}
          spellCheck={false}
          readOnly={readOnly}
          className="admin-scrollbar min-h-[9rem] w-full resize-y border-0 bg-transparent px-3 py-3 font-mono text-sm leading-6 text-foreground outline-none read-only:resize-none"
        />
        <div className="border-t border-border/55 px-3 py-2 font-mono text-xs text-muted-foreground">
          ---
        </div>
      </div>
    </section>
  );
}
