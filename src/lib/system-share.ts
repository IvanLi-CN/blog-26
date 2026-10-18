export const SYSTEM_SHARE_TTL_MS = 15 * 60 * 1000;
export const SYSTEM_SHARE_MAX_FILES = 10;
export const SYSTEM_SHARE_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const SYSTEM_SHARE_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
// Leave bounded room for multipart headers and field values while keeping the
// request parser from accepting an unbounded upload body.
export const SYSTEM_SHARE_MAX_REQUEST_BYTES = SYSTEM_SHARE_MAX_TOTAL_BYTES + 1024 * 1024;
export const SYSTEM_SHARE_CLIPPING_MARKER = "#剪藏";

const SYSTEM_SHARE_CLIPPING_MARKER_RE = /(^|\s)\\?#剪藏(?=$|[\s,.!?，。；：！？）)])/u;

export type SystemShareClassification = "clipping" | "memo";

export type SystemShareFile = {
  name: string;
  type: string;
  size: number;
  lastModified?: number;
};

export type SystemShareValues = {
  title?: string;
  text?: string;
  url?: string;
  tags?: string[];
  isPublic?: boolean;
  files?: SystemShareFile[];
};

export type NormalizedSystemShare = {
  classification: SystemShareClassification;
  title: string;
  text: string;
  url: string | null;
  remarks: string;
  tags: string[];
  isPublic: boolean;
  files: SystemShareFile[];
};

function normalizeEditorTargetLine(line: string): string | null {
  const canonicalLine = line.replace(/^(https?)\\:\/\//iu, "$1://");
  const plainUrl = normalizeHttpUrl(canonicalLine);
  if (plainUrl) return plainUrl;

  const markdownLink = /^\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/iu.exec(canonicalLine);
  if (markdownLink) return normalizeHttpUrl(markdownLink[1]);

  const autolink = /^<(https?:\/\/[^\s>]+)>$/iu.exec(canonicalLine);
  return autolink ? normalizeHttpUrl(autolink[1]) : null;
}

function canonicalizeEditorTargetLine(text: string): string {
  const lines = text.split(/\r?\n/u);
  const firstLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstLineIndex === -1) return text;

  const line = lines[firstLineIndex];
  const canonicalLine = line.replace(/^([ \t]*)(https?)\\:\/\//iu, "$1$2://");
  if (canonicalLine === line) return text;

  lines[firstLineIndex] = canonicalLine;
  return lines.join("\n");
}

function appendSystemShareClippingMarker(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return SYSTEM_SHARE_CLIPPING_MARKER;
  return SYSTEM_SHARE_CLIPPING_MARKER_RE.test(trimmed)
    ? trimmed
    : `${trimmed}\n\n${SYSTEM_SHARE_CLIPPING_MARKER}`;
}

/** Remove the generated marker when an edited share is no longer a clipping. */
export function stripSystemShareClippingMarker(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(new RegExp(`\\n?\\s*${SYSTEM_SHARE_CLIPPING_MARKER}\\s*$`, "u"), "")
    .trim();
}

/**
 * Reclassify the single editable Memo field using the canonical clipping shape:
 * the first non-empty line is the target URL. The raw share contract keeps
 * embedded URLs as ordinary text, but the confirmation editor needs a way to
 * preserve and edit the parsed URL without adding a second input.
 */
export function normalizeSystemShareEditor(values: SystemShareValues): NormalizedSystemShare {
  const canonicalText = canonicalizeEditorTargetLine(values.text?.trim() ?? "");
  const normalized = normalizeSystemShare({ ...values, text: canonicalText });
  if (normalized.classification === "clipping") return normalized;

  const firstLine = canonicalText.split(/\r?\n/u, 1)[0]?.trim() ?? "";
  const firstLineUrl = normalizeEditorTargetLine(firstLine);
  return firstLineUrl
    ? normalizeSystemShare({
        ...values,
        text: canonicalText,
        url: firstLineUrl,
      })
    : normalized;
}

/** Keep the clipping target visible in the one editable Memo field. */
export function composeSystemShareMemoContent(normalized: NormalizedSystemShare): string {
  const text = normalized.text.trim();
  if (normalized.classification !== "clipping") return text;

  if (!normalized.url) return appendSystemShareClippingMarker(text);
  if (!text) return appendSystemShareClippingMarker(normalized.url);

  const lines = text.split(/\r?\n/u);
  const firstLine = lines[0]?.trim() ?? "";
  if (normalizeEditorTargetLine(firstLine) === normalized.url) {
    const remarks = lines.slice(1).join("\n").trim();
    return appendSystemShareClippingMarker(remarks ? `${firstLine}\n\n${remarks}` : firstLine);
  }
  return appendSystemShareClippingMarker(`${normalized.url}\n\n${text}`);
}

export function normalizeHttpUrl(value: string | undefined | null): string | null {
  const candidate = value?.trim() ?? "";
  if (!candidate || !/^https?:\/\/\S+$/iu.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeSystemShare(values: SystemShareValues): NormalizedSystemShare {
  const title = values.title?.trim() ?? "";
  const text = values.text?.trim() ?? "";
  const dedicatedUrl = values.url?.trim() ?? "";
  const url = dedicatedUrl ? normalizeHttpUrl(dedicatedUrl) : normalizeHttpUrl(text);
  const classification: SystemShareClassification = url ? "clipping" : "memo";
  const normalizedTextUrl = normalizeHttpUrl(text);
  const remarks = classification === "clipping" && normalizedTextUrl === url ? "" : text;
  const files = Array.isArray(values.files) ? values.files : [];

  return {
    classification,
    title,
    text,
    url,
    remarks,
    tags: Array.isArray(values.tags) ? values.tags.filter((tag) => typeof tag === "string") : [],
    isPublic: values.isPublic === true,
    files,
  };
}

export function validateSystemShareFiles(files: SystemShareFile[]) {
  if (files.length > SYSTEM_SHARE_MAX_FILES) {
    return { ok: false as const, error: `最多支持 ${SYSTEM_SHARE_MAX_FILES} 个文件。` };
  }
  let total = 0;
  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size < 0 || file.size > SYSTEM_SHARE_MAX_FILE_BYTES) {
      return {
        ok: false as const,
        error: `单个文件不能超过 ${SYSTEM_SHARE_MAX_FILE_BYTES / 1024 / 1024} MiB。`,
      };
    }
    total += file.size;
  }
  if (total > SYSTEM_SHARE_MAX_TOTAL_BYTES) {
    return {
      ok: false as const,
      error: `所有文件合计不能超过 ${SYSTEM_SHARE_MAX_TOTAL_BYTES / 1024 / 1024} MiB。`,
    };
  }
  return { ok: true as const };
}
