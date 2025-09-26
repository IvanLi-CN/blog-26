import { formatAbsoluteDate, formatRelativeTime, toDate } from "../../lib/utils";

type TimeDisplaySource = "publishDate" | "updateDate" | "lastModified" | "unknown";

type DateLike = string | number | Date | null | undefined;

export interface PostTimingInput {
  publishDate?: DateLike;
  updateDate?: DateLike;
  publishedAt?: DateLike;
  timeDisplaySource?: TimeDisplaySource;
}

// We no longer display time-source explanations to users; keep map only for potential future use.
const _FALLBACK_LABEL_MAP: Record<TimeDisplaySource, string> = {
  publishDate: "",
  updateDate: "（自动选择）",
  lastModified: "（自动选择）",
  unknown: "（自动选择）",
};

export interface PostTimingResult {
  publishDateTimeAttr: string | null;
  publishTitle: string | null;
  relativePublish: string;
  relativeUpdate: string | null;
  shouldShowUpdateHint: boolean;
  fallbackLabel: string | null;
  publishDate: Date | null;
  updateDate: Date | null;
}

function resolvePublishDate(input: PostTimingInput): Date | null {
  const published = toDate(input.publishedAt ?? null);
  if (published) return published;

  const publishDate = toDate(input.publishDate ?? null);
  if (publishDate) return publishDate;

  const updateDate = toDate(input.updateDate ?? null);
  if (updateDate) return updateDate;

  return null;
}

export function resolvePostTiming(post: PostTimingInput): PostTimingResult {
  const publishDate = resolvePublishDate(post);
  const updateDate = toDate(post.updateDate ?? null);

  const relativePublish =
    formatRelativeTime(publishDate ?? post.publishDate ?? post.publishedAt ?? post.updateDate) ??
    "未知时间";
  const relativeUpdate = updateDate ? formatRelativeTime(updateDate) : null;

  const publishDateTimeAttr = publishDate?.toISOString() ?? null;
  const publishTitle = formatAbsoluteDate(publishDate) ?? null;

  const shouldShowUpdateHint = Boolean(
    updateDate && publishDate && Math.abs(updateDate.getTime() - publishDate.getTime()) > 1000
  );

  // 不向任何用户解释时间来源，统一不返回回退标签
  const _fallbackLabel = null;

  return {
    publishDateTimeAttr,
    publishTitle,
    relativePublish,
    relativeUpdate,
    shouldShowUpdateHint,
    fallbackLabel: null,
    publishDate,
    updateDate,
  };
}
