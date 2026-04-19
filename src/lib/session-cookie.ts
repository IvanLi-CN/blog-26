import { resolveRequestOrigin } from "@/lib/public-cors";

type SessionCookieOptions = {
  maxAge: number;
  value?: string;
};

function normalizeOrigin(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isCrossSiteRequest(request: Pick<Request, "headers" | "url">) {
  const requestOrigin = resolveRequestOrigin(request);
  const callerOrigin = normalizeOrigin(request.headers.get("origin"));
  return Boolean(requestOrigin && callerOrigin && requestOrigin !== callerOrigin);
}

function shouldUseSecureCookie(request: Pick<Request, "headers" | "url">, crossSite: boolean) {
  if (crossSite) return true;
  if ((process.env.COOKIE_SECURE || "").trim() === "true") return true;

  const requestOrigin = resolveRequestOrigin(request);
  return requestOrigin?.startsWith("https://") ?? false;
}

export function createSessionCookieHeader(
  request: Pick<Request, "headers" | "url">,
  cookieName: string,
  options: SessionCookieOptions
) {
  const crossSite = isCrossSiteRequest(request);
  const secure = shouldUseSecureCookie(request, crossSite);
  const sameSite = crossSite ? "None" : "Lax";
  const value = options.value ?? "";

  return [
    `${cookieName}=${value}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${options.maxAge}`,
    `SameSite=${sameSite}`,
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}
