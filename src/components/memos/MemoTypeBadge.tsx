import Icon from "@/components/ui/Icon";
import { getMemoPresentation } from "@/lib/memo-presentation";

export function MemoTypeBadge({
  record,
  surface = "public",
}: {
  record: Parameters<typeof getMemoPresentation>[0];
  surface?: "public" | "admin";
}) {
  const presentation = getMemoPresentation(record);
  return (
    <span
      className={
        surface === "admin"
          ? "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/62 px-3 py-1 text-xs text-muted-foreground"
          : "nature-chip gap-1"
      }
      data-content-kind={presentation.kind}
    >
      <Icon name={presentation.icon} className="h-3.5 w-3.5" />
      {presentation.kind === "clipping" ? presentation.label : "Memo"}
    </span>
  );
}
