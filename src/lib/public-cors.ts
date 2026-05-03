const DEFAULT_ALLOW_HEADERS = "content-type, authorization, x-requested-with";

function normalizeOrigin(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function resolveRequestOrigin(request: Pick<Request, "headers" | "url">) {
  if ((process.env.TRUST_PROXY_FORWARD_HEADERS || "").trim() === "true") {
    const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();

    if (forwardedHost && forwardedProto) {
      return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
    }
  }

  return normalizeOrigin(request.url);
}

function getConfiguredPublicOrigins() {
  const configured = [
    process.env.PUBLIC_SITE_URL,
    ...(process.env.PUBLIC_CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(configured)];
}

function appendVary(headers: Headers, value: string) {
  const current = headers.get("vary");
  if (!current) {
    headers.set("vary", value);
    return;
  }

  const parts = current
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.includes(value)) {
    headers.set("vary", [...parts, value].join(", "));
  }
}

function resolveAllowedOrigin(request: Pick<Request, "headers" | "url">) {
  const requestOrigin = resolveRequestOrigin(request);
  const originHeader = normalizeOrigin(request.headers.get("origin"));

  if (!originHeader) return null;
  if (requestOrigin && originHeader === requestOrigin) return originHeader;

  const configuredOrigins = getConfiguredPublicOrigins();
  return configuredOrigins.includes(originHeader) ? originHeader : null;
}

export function appendPublicCorsHeaders(
  headers: Headers,
  request: Pick<Request, "headers" | "url">,
  methods: readonly string[]
) {
  const allowedOrigin = resolveAllowedOrigin(request);
  if (!allowedOrigin) {
    return headers;
  }

  headers.set("access-control-allow-origin", allowedOrigin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", methods.join(", "));
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") || DEFAULT_ALLOW_HEADERS
  );

  appendVary(headers, "Origin");
  appendVary(headers, "Access-Control-Request-Headers");
  return headers;
}

export function createPublicCorsPreflightResponse(
  request: Pick<Request, "headers" | "url">,
  methods: readonly string[]
) {
  const headers = appendPublicCorsHeaders(new Headers(), request, methods);
  if (!headers.get("access-control-allow-origin")) {
    return new Response(null, { status: 403 });
  }

  headers.set("access-control-max-age", "86400");
  return new Response(null, { status: 204, headers });
}
