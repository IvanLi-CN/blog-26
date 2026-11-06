import type { ConversationImageResourceContext } from "../conversation/types";

export type ConversationImagePolicy =
  | { kind: "authorized"; src: string }
  | { kind: "external"; src: string; domain: string }
  | { kind: "unavailable"; reason: "unsafe-url" | "missing-authorization" | "resolver-failed" };

/** Validate before calling even the trusted resolver. Never normalize a consent URL. */
function inspectImageUrl(src: string): "https" | "relative" | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject browser URL control-character normalization before any resolver or request.
  if (!src || src !== src.trim() || /[\u0000-\u0020\u007f\\]/u.test(src)) return null;
  if (src.startsWith("//") || src.startsWith("?") || src.startsWith("#")) return null;
  if (/^https:\/\//iu.test(src)) {
    const authority = /^https:\/\/([^/?#]+)/iu.exec(src)?.[1];
    if (!authority || authority.includes("@")) return null;
    try {
      const url = new URL(src);
      return url.protocol === "https:" && url.hostname && !url.username && !url.password
        ? "https"
        : null;
    } catch {
      return null;
    }
  }
  // Reject all schemes, including malformed/obfuscated browser-special schemes.
  return /^[^/?#]*:/u.test(src) ? null : "relative";
}

/** This function does no I/O. The caller's resolver owns the actual resource authorization. */
export function classifyConversationImage(
  src: string,
  resourceContext?: ConversationImageResourceContext
): ConversationImagePolicy {
  const sourceKind = inspectImageUrl(src);
  if (!sourceKind) return { kind: "unavailable", reason: "unsafe-url" };

  try {
    const resolved = resourceContext?.resolveAuthorizedImage(src);
    if (resolved) {
      const resolvedKind = inspectImageUrl(resolved.src);
      if (
        resolvedKind === "https" ||
        (resolvedKind === "relative" && resolved.src.startsWith("/"))
      ) {
        return { kind: "authorized", src: resolved.src };
      }
      return { kind: "unavailable", reason: "unsafe-url" };
    }
  } catch {
    return { kind: "unavailable", reason: "resolver-failed" };
  }

  if (sourceKind === "https") {
    return { kind: "external", src, domain: new URL(src).hostname };
  }
  return { kind: "unavailable", reason: "missing-authorization" };
}
