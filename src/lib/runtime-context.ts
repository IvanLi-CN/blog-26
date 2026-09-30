export type RuntimeMode = "public" | "console";

function normalizeHost(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/:\d+$/, "");
}

export function resolveRuntimeContext(request: Pick<Request, "headers" | "url">) {
  const directHost = normalizeHost(request.headers.get("host") || new URL(request.url).host);
  const publicHost = normalizeHost(process.env.PUBLIC_HOST || "ivanli.cc");
  const fallbackSecret = process.env.EDGEONE_PUBLIC_FALLBACK_SECRET?.trim();
  const fallbackHeader = request.headers.get("x-edgeone-public-fallback")?.trim();
  const trustedFallback = Boolean(
    fallbackSecret && fallbackHeader && fallbackHeader === fallbackSecret
  );
  const forwardedHost = normalizeHost(request.headers.get("x-forwarded-host"));
  const host = trustedFallback && forwardedHost ? forwardedHost : directHost;

  return {
    mode: host === publicHost || trustedFallback ? ("public" as const) : ("console" as const),
    host,
    isTrustedPublicFallback: trustedFallback,
  };
}
