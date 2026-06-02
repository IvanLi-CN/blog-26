import { useRef, useState } from "react";

type SourceEditorProps = {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  onImageUpload?: (file: File) => Promise<string>;
  textareaLabel?: string;
  textareaName?: string;
  "data-testid"?: string;
};

export function SourceEditor({
  content,
  onChange,
  placeholder = "开始编写...",
  className = "",
  onImageUpload,
  textareaLabel = "Markdown source editor",
  textareaName,
  "data-testid": dataTestId,
}: SourceEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const lineCount = content.split("\n").length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, index) => index + 1);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    if (!onImageUpload) return;

    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length === 0 || !textareaRef.current) return;

    try {
      for (const file of files) {
        const imageUrl = await onImageUpload(file);
        const markdown = `![${file.name}](${imageUrl})`;
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const nextContent = content.slice(0, start) + markdown + content.slice(end);
        onChange(nextContent);

        setTimeout(() => {
          textarea.focus();
          const nextCursor = start + markdown.length;
          textarea.setSelectionRange(nextCursor, nextCursor);
        }, 0);
      }
    } catch (error) {
      console.error("图片上传失败:", error);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextContent = `${content.slice(0, start)}  ${content.slice(end)}`;
      onChange(nextContent);
      setTimeout(() => textarea.setSelectionRange(start + 2, start + 2), 0);
    }

    if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
    }
  };

  return (
    <div
      className={`relative flex h-full min-h-0 overflow-hidden bg-transparent ${className}`}
      data-testid={dataTestId}
    >
      <div
        ref={lineNumbersRef}
        className="admin-scrollbar hidden w-12 shrink-0 overflow-hidden border-r border-border bg-muted/60 py-3 pr-2 text-right font-mono text-xs text-muted-foreground md:block"
        style={{ lineHeight: "1.5rem" }}
      >
        {lineNumbers.map((num) => (
          <div key={num} className="leading-6">
            {num}
          </div>
        ))}
      </div>

      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => onChange(event.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          placeholder={placeholder}
          aria-label={textareaLabel}
          name={textareaName}
          className={`admin-scrollbar h-full min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground focus:outline-none ${isDragOver ? "bg-primary/5" : ""}`}
          spellCheck={false}
        />

        {isDragOver ? (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-3xl border border-dashed border-primary/60 bg-primary/10 text-sm font-medium text-primary">
            拖拽图片到这里上传
          </div>
        ) : null}
      </div>
    </div>
  );
}
