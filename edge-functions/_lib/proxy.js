const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

const IDENTITY_HEADERS = ["authorization", "cookie", "remote-email", "x-forwarded-email"];

function unavailableResponse() {
  return new Response("Bad Gateway", {
    status: 502,
    headers: { "cache-control": "no-store" },
  });
}

function resolveUpstreamOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const upstream = new URL(value);
    if (
      upstream.protocol !== "https:" ||
      upstream.username ||
      upstream.password ||
      upstream.pathname !== "/" ||
      upstream.search ||
      upstream.hash
    ) {
      return null;
    }
    return upstream;
  } catch {
    return null;
  }
}

function isPublicHost(request) {
  const incoming = new URL(request.url);
  const publicHost = String(request.headers.get("host") || incoming.host)
    .split(":", 1)[0]
    .toLowerCase();
  return publicHost === "ivanli.cc";
}

function resolveSsoEmailHeaderName(env) {
  return typeof env?.SSO_EMAIL_HEADER_NAME === "string" && env.SSO_EMAIL_HEADER_NAME.trim()
    ? env.SSO_EMAIL_HEADER_NAME.trim()
    : "Remote-Email";
}

function stripPublicResponseIdentity(response) {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.delete("set-cookie2");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildUpstreamRequest(request, upstream, env) {
  const incoming = new URL(request.url);
  const target = new URL(request.url);
  target.protocol = upstream.protocol;
  target.host = upstream.host;

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

  if (isPublicHost(request)) {
    for (const header of [...IDENTITY_HEADERS, resolveSsoEmailHeaderName(env)]) {
      headers.delete(header);
    }
    const fallbackSecret =
      typeof env?.EDGEONE_PUBLIC_FALLBACK_SECRET === "string"
        ? env.EDGEONE_PUBLIC_FALLBACK_SECRET.trim()
        : "";
    if (fallbackSecret) headers.set("x-edgeone-public-fallback", fallbackSecret);
  }

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return new Request(target, init);
}

export function createProxyHandler(envKey = "BLOG_BACKEND_ORIGIN") {
  return async function onRequest(context) {
    const upstream = resolveUpstreamOrigin(context.env?.[envKey]);
    if (!upstream) return unavailableResponse();

    try {
      const response = await fetch(buildUpstreamRequest(context.request, upstream, context.env));
      return isPublicHost(context.request) ? stripPublicResponseIdentity(response) : response;
    } catch {
      return unavailableResponse();
    }
  };
}
