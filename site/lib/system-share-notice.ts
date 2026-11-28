const SUCCESS_NOTICE_KEY = "ivan-console-system-share-success";
const SUCCESS_NOTICE_TTL_MS = 15_000;

type SystemShareSuccessNotice = {
  message: string;
  path: string;
  expiresAt: number;
};

/**
 * A successful publish navigates immediately, so the confirmation document
 * cannot keep the success notice on screen. The notice is handed to the
 * destination document once; only the page whose path matches may consume it.
 * See UX.md: cross-page feedback is delivered once, never replayed.
 */
export function queueSystemShareSuccessNotice(message: string, path: string) {
  if (typeof window === "undefined") return;
  const notice: SystemShareSuccessNotice = {
    message,
    path,
    expiresAt: Date.now() + SUCCESS_NOTICE_TTL_MS,
  };
  try {
    window.sessionStorage.setItem(SUCCESS_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    // Navigation still completes; the notice is a non-blocking confirmation.
  }
}

export function consumeSystemShareSuccessNotice(pathname: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SUCCESS_NOTICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SystemShareSuccessNotice>;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(SUCCESS_NOTICE_KEY);
      return null;
    }
    if (typeof parsed.message !== "string" || !parsed.message) return null;
    if (typeof parsed.path !== "string") return null;
    // A document that is not the destination leaves the notice untouched.
    if (parsed.path.replace(/\/+$/, "") !== pathname.replace(/\/+$/, "")) return null;
    window.sessionStorage.removeItem(SUCCESS_NOTICE_KEY);
    return parsed.message;
  } catch {
    return null;
  }
}
