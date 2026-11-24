export type PublicErrorKind =
  | "network"
  | "unauthenticated"
  | "forbidden"
  | "invalid-request"
  | "not-found"
  | "unavailable"
  | "rate-limited";

export type PublicErrorCode =
  | "NETWORK_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "CONFLICT"
  | "NOT_FOUND"
  | "GONE"
  | "FEATURE_DISABLED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

type PublicErrorPreset = {
  kind: PublicErrorKind;
  message: string;
};

export const PUBLIC_ERROR_PRESETS: Record<PublicErrorCode, PublicErrorPreset> = {
  NETWORK_ERROR: { kind: "network", message: "网络连接中断，请检查网络后重试。" },
  UNAUTHORIZED: { kind: "unauthenticated", message: "请先登录后再继续操作。" },
  FORBIDDEN: { kind: "forbidden", message: "当前账号没有执行该操作的权限。" },
  INVALID_REQUEST: { kind: "invalid-request", message: "请求参数不合法，请检查后重试。" },
  CONFLICT: { kind: "invalid-request", message: "当前状态已变化，请刷新后重试。" },
  NOT_FOUND: { kind: "not-found", message: "目标内容不存在或已不可用。" },
  GONE: { kind: "not-found", message: "目标内容已不可用。" },
  FEATURE_DISABLED: { kind: "unavailable", message: "该功能当前未开放。" },
  RATE_LIMITED: { kind: "rate-limited", message: "操作过于频繁，请稍后再试。" },
  QUOTA_EXCEEDED: { kind: "rate-limited", message: "本次额度已用完，请稍后再试。" },
  SERVICE_UNAVAILABLE: { kind: "unavailable", message: "服务暂不可用，请稍后重试。" },
  INTERNAL_ERROR: { kind: "unavailable", message: "服务处理失败，请稍后重试。" },
};

const STATUS_FALLBACK_CODES: Record<number, PublicErrorCode> = {
  400: "INVALID_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "INVALID_REQUEST",
  409: "CONFLICT",
  410: "GONE",
  412: "INVALID_REQUEST",
  413: "INVALID_REQUEST",
  415: "INVALID_REQUEST",
  422: "INVALID_REQUEST",
  429: "RATE_LIMITED",
  503: "SERVICE_UNAVAILABLE",
};

/** Internal markers that map onto a registered visitor code. */
const CODE_ALIASES: Record<string, PublicErrorCode> = {
  PRECONDITION_FAILED: "INVALID_REQUEST",
  PAYLOAD_TOO_LARGE: "INVALID_REQUEST",
  METHOD_NOT_SUPPORTED: "INVALID_REQUEST",
  TOO_MANY_REQUESTS: "RATE_LIMITED",
  INTERNAL_SERVER_ERROR: "INTERNAL_ERROR",
  BAD_REQUEST: "INVALID_REQUEST",
  NOT_IMPLEMENTED: "SERVICE_UNAVAILABLE",
  QUOTA: "QUOTA_EXCEEDED",
  "not-found": "NOT_FOUND",
  gone: "GONE",
  conflict: "CONFLICT",
  quota: "QUOTA_EXCEEDED",
};

function isPublicErrorCode(value: string): value is PublicErrorCode {
  return Object.hasOwn(PUBLIC_ERROR_PRESETS, value);
}

export function publicErrorCodeForStatus(status: number): PublicErrorCode {
  return STATUS_FALLBACK_CODES[status] ?? "INTERNAL_ERROR";
}

export function normalizePublicErrorCode(
  code: string | null | undefined,
  status: number
): PublicErrorCode {
  if (code) {
    if (isPublicErrorCode(code)) return code;
    const alias = CODE_ALIASES[code];
    if (alias) return alias;
  }
  return publicErrorCodeForStatus(status);
}

export function publicErrorMessage(code: PublicErrorCode): string {
  return PUBLIC_ERROR_PRESETS[code].message;
}

export function createErrorRef() {
  return `err_${crypto.randomUUID().replace(/-/gu, "").slice(0, 10)}`;
}

export type PublicErrorBody = {
  error: string;
  code: PublicErrorCode;
  errorRef: string;
};

/**
 * Visitor-facing failure payload. The technical message never survives this
 * boundary; `errorRef` is the only handle back to the server-side log entry.
 */
export function buildPublicErrorBody(
  input: { code?: string | null; status: number },
  logContext?: unknown
): PublicErrorBody {
  const code = normalizePublicErrorCode(input.code, input.status);
  const errorRef = createErrorRef();
  const entry = { errorRef, code, status: input.status, cause: logContext };
  if (input.status >= 500) console.error("[public-error]", entry);
  else console.warn("[public-error]", entry);
  return { error: publicErrorMessage(code), code, errorRef };
}

/**
 * Rewrites any error-shaped body that would otherwise leak upstream text.
 * Bodies without an `error` field are not error payloads and pass through.
 */
export function sanitizePublicErrorBody(
  data: unknown,
  status: number,
  options: { isAdmin?: boolean } = {}
): unknown {
  if (options.isAdmin) return data;
  if (status < 400 || !data || typeof data !== "object") return data;
  if (!("error" in data)) return data;

  const incoming = data as { error?: unknown; code?: unknown };
  return buildPublicErrorBody(
    {
      status,
      code: typeof incoming.code === "string" ? incoming.code : null,
    },
    typeof incoming.error === "string" ? incoming.error : undefined
  );
}
