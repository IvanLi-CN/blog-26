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

  const publicHost = String(request.headers.get("host") || incoming.host)
    .split(":", 1)[0]
    .toLowerCase();
  if (publicHost === "ivanli.cc") {
    for (const header of ["authorization", "cookie", "remote-email", "x-forwarded-email"]) {
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
      return await fetch(buildUpstreamRequest(context.request, upstream, context.env));
    } catch {
      return unavailableResponse();
    }
  };
}
