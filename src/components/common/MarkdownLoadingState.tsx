export function MarkdownLoadingState() {
  return (
    <div
      className="nature-markdown-loading"
      role="status"
      aria-live="polite"
      aria-label="正文加载中"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-[color:var(--nature-text-soft)]">
        <span className="nature-spinner" aria-hidden="true" />
        <span>正在整理正文</span>
      </div>
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="nature-skeleton h-4 w-11/12 rounded-full" />
        <div className="nature-skeleton h-4 w-full rounded-full" />
        <div className="nature-skeleton h-4 w-4/5 rounded-full" />
        <div className="nature-skeleton h-4 w-9/12 rounded-full" />
      </div>
    </div>
  );
}
