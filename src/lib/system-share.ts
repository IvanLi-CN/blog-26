export const SYSTEM_SHARE_TTL_MS = 15 * 60 * 1000;
export const SYSTEM_SHARE_MAX_FILES = 10;
export const SYSTEM_SHARE_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const SYSTEM_SHARE_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

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
