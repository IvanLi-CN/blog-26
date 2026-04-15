import { AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react";
import type { ReactNode } from "react";
import { formatRelativeTime as baseFormatRelativeTime, cn, toMsTimestamp } from "@/lib/utils";
import { CardDescription, CardHeader, CardTitle } from "~/components/ui";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <CardHeader className="p-0">
        <CardTitle className="text-3xl lg:text-4xl">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function formatDateTime(input: number | string | null | undefined) {
  if (!input) return "-";
  const date = new Date(typeof input === "number" ? toMsTimestamp(input) : input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleString("zh-CN");
}

export function formatRelativeTime(input: number | string | null | undefined) {
  return baseFormatRelativeTime(input) ?? "-";
}

export function formatCount(value: unknown) {
  if (typeof value === "number") return new Intl.NumberFormat("zh-CN").format(value);
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return new Intl.NumberFormat("zh-CN").format(numeric);
  }
  return "-";
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "请求失败";
}

export function StatusDot({ tone = "info" }: { tone?: "info" | "success" | "warning" | "danger" }) {
  const iconClass = "size-4";
  return tone === "success" ? (
    <CheckCircle2 className={cn(iconClass, "text-emerald-300")} />
  ) : tone === "warning" ? (
    <AlertTriangle className={cn(iconClass, "text-amber-300")} />
  ) : tone === "danger" ? (
    <CircleSlash className={cn(iconClass, "text-destructive")} />
  ) : (
    <Info className={cn(iconClass, "text-primary")} />
  );
}
