export function formatAbsoluteDate(input: string | number | Date | null | undefined) {
  if (!input) return "未知时间";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(input: string | number | Date | null | undefined) {
  if (!input) return "未知时间";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
