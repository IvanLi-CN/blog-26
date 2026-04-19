import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { getSsoEmailHeaderName } from "@/lib/admin-config";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import { handleAdminApiRequest } from "@/server/admin-api/router";
import { handleFilesApiRequest } from "@/server/files-api/router";
import { handleMcpHttpRequest } from "@/server/mcp-http";
import { handlePublicApiRequest } from "@/server/public-api/router";

type GatewayMode = "dev" | "production";

const mode = (process.env.NODE_ENV === "production" ? "production" : "dev") as GatewayMode;
const publicPort = Number(process.env.PORT || 25090);
const nextPort = Number(process.env.INTERNAL_NEXT_PORT || publicPort + 2);
const sitePort = Number(process.env.SITE_PORT || publicPort + 3);
const adminPort = Number(process.env.ADMIN_PORT || publicPort + 4);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const internalHostname = process.env.INTERNAL_HOSTNAME || "127.0.0.1";
const siteDistDir = resolve(process.cwd(), process.env.SITE_DIST_DIR || "site-dist");
const adminDistDir = resolve(process.cwd(), process.env.ADMIN_DIST_DIR || "admin-dist");
const servePublicSite =
  mode === "dev" ? true : (process.env.SERVE_PUBLIC_SITE || "false").trim() === "true";
const localPreviewSsoEmail = process.env.LOCAL_PREVIEW_SSO_EMAIL?.trim();

function log(message: string, extra?: Record<string, unknown>) {
  if (extra) {
    console.log(`[gateway] ${message}`, extra);
  } else {
    console.log(`[gateway] ${message}`);
  }
}

function isPublicApiPath(pathname: string) {
  return pathname === "/api/public" || pathname.startsWith("/api/public/");
}

function isAdminApiPath(pathname: string) {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

function isFilesApiPath(pathname: string) {
  return pathname === "/api/files" || pathname.startsWith("/api/files/");
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isPreviewableContentPath(pathname: string) {
  return pathname.startsWith("/posts/") || pathname.startsWith("/memos/");
}

function isLegacyPreviewRequest(pathname: string, searchParams: URLSearchParams) {
  return isPreviewableContentPath(pathname) && searchParams.get("admin-preview") === "1";
}

function isNonProductionUiToolPath(pathname: string) {
  const prefixes = ["/dev", "/theme-test", "/test-editor", "/demo-integration", "/demo-memo-card"];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isLegacyDevApiPath(pathname: string) {
  if (pathname === "/api" || pathname === "/_next" || pathname.startsWith("/_next/")) {
    return true;
  }

  if (!pathname.startsWith("/api/")) {
    return false;
  }

  return (
    !isPublicApiPath(pathname) &&
    !isAdminApiPath(pathname) &&
    !isFilesApiPath(pathname) &&
    pathname !== "/api/health" &&
    pathname !== "/mcp"
  );
}

function buildAdminPreviewPath(pathname: string) {
  if (pathname.startsWith("/posts/")) {
    const slug = pathname.replace(/^\/posts\//, "");
    return `/admin/preview/posts/${slug}`;
  }
  if (pathname.startsWith("/memos/")) {
    const slug = pathname.replace(/^\/memos\//, "");
    return `/admin/preview/memos/${slug}`;
  }
  return "/admin";
}

function isHtmlNavigationRequest(request: Request, pathname: string) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  if (extname(pathname)) {
    return false;
  }

  const destination = request.headers.get("sec-fetch-dest");
  if (destination === "document" || destination === "iframe") {
    return true;
  }

  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function shouldInjectLocalPreviewIdentity(pathname: string, searchParams: URLSearchParams) {
  return (
    isAdminPath(pathname) ||
    isAdminApiPath(pathname) ||
    isFilesApiPath(pathname) ||
    pathname === "/api/files" ||
    pathname.startsWith("/api/files/") ||
    pathname === "/api/tags/organize" ||
    pathname.startsWith("/api/tags/organize/") ||
    isLegacyDevApiPath(pathname) ||
    isNonProductionUiToolPath(pathname) ||
    isLegacyPreviewRequest(pathname, searchParams)
  );
}

function withLocalPreviewIdentity(
  request: Request,
  pathname: string,
  searchParams: URLSearchParams
) {
  if (!localPreviewSsoEmail || !shouldInjectLocalPreviewIdentity(pathname, searchParams)) {
    return request;
  }

  const headerName = getSsoEmailHeaderName();
  const headers = new Headers(request.headers);
  headers.set(headerName, localPreviewSsoEmail);

  return new Request(request, { headers });
}

function isAdminAssetRequest(pathname: string) {
  if (!isAdminPath(pathname)) {
    return false;
  }

  const relativePath = pathname.replace(/^\/admin\/?/, "/");
  return (
    relativePath.startsWith("/assets/") ||
    relativePath.startsWith("/@vite/") ||
    relativePath.startsWith("/src/") ||
    relativePath.startsWith("/node_modules/") ||
    relativePath.startsWith("/@fs/") ||
    Boolean(extname(relativePath))
  );
}

async function fileExists(path: string) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function resolveStaticAsset(pathname: string) {
  const decoded = decodeURIComponent(pathname);
  const safePath = decoded.replace(/^\/+/, "");
  const candidates = [] as string[];

  if (!safePath) {
    candidates.push(resolve(siteDistDir, "index.html"));
  } else if (safePath.endsWith("/")) {
    candidates.push(resolve(siteDistDir, safePath, "index.html"));
  } else {
    candidates.push(resolve(siteDistDir, safePath));
    if (!extname(safePath)) {
      candidates.push(resolve(siteDistDir, safePath, "index.html"));
    }
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(siteDistDir)) continue;
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

async function resolveAdminAsset(pathname: string) {
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded.replace(/^\/admin\/?/, "");

  if (!relativePath) {
    return resolve(adminDistDir, "index.html");
  }

  const safePath = relativePath.replace(/^\/+/, "");
  const candidate = resolve(adminDistDir, safePath);
  if (!candidate.startsWith(adminDistDir)) {
    return null;
  }

  return (await fileExists(candidate)) ? candidate : null;
}

function normalizeAdminDevPath(pathname: string) {
  if (pathname === "/admin") {
    return "/admin/";
  }

  return pathname;
}

function renderHtmlStatusPage(status: number, title: string, message: string) {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        --background: #0b1020;
        --panel: rgba(15, 23, 42, 0.88);
        --border: rgba(148, 163, 184, 0.24);
        --foreground: #e2e8f0;
        --muted: #94a3b8;
        --accent: #60a5fa;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, rgba(37, 99, 235, 0.14), transparent 50%), var(--background);
        color: var(--foreground);
        font-family: Inter, system-ui, sans-serif;
      }
      main {
        width: min(32rem, calc(100vw - 2rem));
        padding: 2rem;
        border: 1px solid var(--border);
        border-radius: 1.25rem;
        background: var(--panel);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.28);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.875rem;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }
      strong {
        color: var(--accent);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}

async function proxyRequest(request: Request, target: URL) {
  const requestUrl = new URL(request.url);
  const requestHeaders = new Headers(request.headers);
  const host = request.headers.get("host") || requestUrl.host;
  const proto = requestUrl.protocol.replace(/:$/, "");

  requestHeaders.set("host", host);
  requestHeaders.set("x-forwarded-host", host);
  requestHeaders.set("x-forwarded-proto", proto);
  requestHeaders.set("x-forwarded-port", String(publicPort));

  const upstream = await fetch(target, {
    method: request.method,
    headers: requestHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");

  const location = responseHeaders.get("location");
  if (location) {
    if (location.startsWith(target.origin)) {
      responseHeaders.set("location", location.replace(target.origin, requestUrl.origin));
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function checkSiteHealth() {
  if (!servePublicSite) {
    return true;
  }

  if (mode === "production") {
    return existsSync(resolve(siteDistDir, "index.html"));
  }
  try {
    const response = await fetch(`http://${internalHostname}:${sitePort}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkAdminHealth() {
  if (mode === "production") {
    return existsSync(resolve(adminDistDir, "index.html"));
  }

  try {
    const response = await fetch(`http://${internalHostname}:${adminPort}/admin/`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkGatewayApiHealth() {
  const origin = `http://${internalHostname}:${publicPort}`;
  const publicApi = await handlePublicApiRequest(
    new Request(`${origin}/api/public/posts?limit=1`),
    "/posts"
  )
    .then((response) => response.ok)
    .catch(() => false);

  const adminApi = await handleAdminApiRequest(
    new Request(`${origin}/api/admin/session`),
    "/session"
  )
    .then((response) => response.ok)
    .catch(() => false);

  const filesApi = await handleFilesApiRequest(new Request(`${origin}/api/files/invalid/health`), {
    source: "invalid",
    path: ["health"],
  })
    .then((response) => response.status === 400)
    .catch(() => false);

  const mcp = await (async () => {
    try {
      const initializeResponse = await handleMcpHttpRequest(
        new Request(`${origin}/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-03-26",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "health-check",
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "gateway-health", version: "1.0.0" },
            },
          }),
        })
      );

      if (!initializeResponse.ok) {
        return false;
      }

      const sessionId =
        initializeResponse.headers.get("mcp-session-id") ||
        initializeResponse.headers.get("Mcp-Session-Id");

      if (!sessionId) {
        return false;
      }

      const closeResponse = await handleMcpHttpRequest(
        new Request(`${origin}/mcp`, {
          method: "DELETE",
          headers: {
            accept: "application/json, text/event-stream",
            "mcp-session-id": sessionId,
            "mcp-protocol-version": "2025-03-26",
          },
        })
      );

      return closeResponse.ok;
    } catch {
      return false;
    }
  })();

  return {
    publicApi,
    adminApi,
    filesApi,
    mcp,
  };
}

const server = Bun.serve({
  hostname,
  port: publicPort,
  fetch: async (request) => {
    const url = new URL(request.url);
    const { pathname, search, searchParams } = url;
    const effectiveRequest = withLocalPreviewIdentity(request, pathname, searchParams);

    if (pathname === "/api/health") {
      const [siteHealthy, adminHealthy, gatewayApis] = await Promise.all([
        checkSiteHealth(),
        checkAdminHealth(),
        mode === "production"
          ? checkGatewayApiHealth()
          : Promise.resolve({
              publicApi: true,
              adminApi: true,
              filesApi: true,
              mcp: true,
            }),
      ]);
      const nextHealthy =
        mode === "dev"
          ? await fetch(`http://${internalHostname}:${nextPort}/api/health`, {
              signal: AbortSignal.timeout(1500),
            })
              .then((response) => response.ok)
              .catch(() => false)
          : null;
      const gatewayApisHealthy = Object.values(gatewayApis).every(Boolean);
      const status =
        siteHealthy && adminHealthy && gatewayApisHealthy && (mode === "production" || nextHealthy)
          ? 200
          : 503;
      return Response.json(
        {
          status: status === 200 ? "ok" : "degraded",
          mode,
          gateway: { status: "ok", port: publicPort },
          site: {
            status: servePublicSite ? (siteHealthy ? "ok" : "down") : "external",
            mode: servePublicSite ? (mode === "production" ? "static" : "proxy") : "external",
            target: servePublicSite
              ? mode === "production"
                ? siteDistDir
                : `http://${internalHostname}:${sitePort}`
              : null,
          },
          legacyNext: {
            status: mode === "production" ? "not-applicable" : nextHealthy ? "ok" : "down",
            target: mode === "production" ? null : `http://${internalHostname}:${nextPort}`,
          },
          admin: {
            status: adminHealthy ? "ok" : "down",
            mode: mode === "production" ? "static" : "proxy",
            target:
              mode === "production" ? adminDistDir : `http://${internalHostname}:${adminPort}`,
          },
          gatewayApis: {
            status: gatewayApisHealthy ? "ok" : "degraded",
            checks: gatewayApis,
          },
        },
        {
          status,
          headers: {
            "cache-control": "no-store",
          },
        }
      );
    }

    if (isPublicApiPath(pathname)) {
      const subPath = pathname.replace(/^\/api\/public/, "") || "/";
      return handlePublicApiRequest(effectiveRequest, subPath);
    }

    if (isAdminApiPath(pathname)) {
      const subPath = pathname.replace(/^\/api\/admin/, "") || "/";
      return handleAdminApiRequest(effectiveRequest, subPath);
    }

    if (isFilesApiPath(pathname)) {
      const match = pathname.match(/^\/api\/files\/([^/]+)\/?(.*)$/);
      if (!match) {
        return new Response("Not Found", { status: 404 });
      }
      const source = decodeURIComponent(match[1]);
      const tail = match[2] || "";
      const pathSegments =
        tail.length > 0 ? tail.split("/").filter(Boolean).map(decodeURIComponent) : [];
      return handleFilesApiRequest(effectiveRequest, { source, path: pathSegments });
    }

    if (pathname === "/mcp") {
      return handleMcpHttpRequest(effectiveRequest);
    }

    if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
      return renderHtmlStatusPage(
        404,
        "Admin login removed",
        "This deployment no longer serves a standalone admin login page."
      );
    }

    if (isLegacyPreviewRequest(pathname, searchParams)) {
      const isHtmlRequest = isHtmlNavigationRequest(effectiveRequest, pathname);
      if (isHtmlRequest) {
        const auth = await extractAuthFromRequest(effectiveRequest);
        if (!auth.user) {
          return renderHtmlStatusPage(
            401,
            "Authentication required",
            "Open this preview from the admin editor with a valid development session or SSO identity."
          );
        }

        if (!auth.isAdmin) {
          return renderHtmlStatusPage(
            403,
            "Admin preview denied",
            "This preview is reserved for administrator sessions only."
          );
        }
      }
      return Response.redirect(new URL(buildAdminPreviewPath(pathname), url), 307);
    }

    if (isAdminPath(pathname)) {
      const requiresAdminAuth = !isAdminAssetRequest(pathname);

      if (requiresAdminAuth) {
        const auth = await extractAuthFromRequest(effectiveRequest);
        if (!auth.user) {
          return renderHtmlStatusPage(
            401,
            "Authentication required",
            "Open the admin area with a valid development session or SSO identity."
          );
        }

        if (!auth.isAdmin) {
          return renderHtmlStatusPage(
            403,
            "Admin access denied",
            "Your current account is signed in, but it does not have administrator privileges."
          );
        }
      }

      if (mode === "dev") {
        const targetPath = normalizeAdminDevPath(pathname);
        const target = new URL(`${targetPath}${search}`, `http://${internalHostname}:${adminPort}`);
        return proxyRequest(effectiveRequest, target);
      }

      if (requiresAdminAuth) {
        return new Response(Bun.file(resolve(adminDistDir, "index.html")), {
          headers: {
            "cache-control": "no-store",
          },
        });
      }

      const adminAsset = await resolveAdminAsset(pathname);
      if (adminAsset) {
        return new Response(Bun.file(adminAsset));
      }

      if (isAdminAssetRequest(pathname)) {
        return new Response("Not Found", { status: 404 });
      }

      return new Response(Bun.file(resolve(adminDistDir, "index.html")), {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    if (mode === "dev" && (isLegacyDevApiPath(pathname) || isNonProductionUiToolPath(pathname))) {
      const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${nextPort}`);
      return proxyRequest(effectiveRequest, target);
    }

    if (pathname.startsWith("/_next/")) {
      if (mode === "dev") {
        const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${nextPort}`);
        return proxyRequest(effectiveRequest, target);
      }
      return new Response("Not Found", { status: 404 });
    }

    if (pathname.startsWith("/api/")) {
      if (mode === "dev") {
        const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${nextPort}`);
        return proxyRequest(effectiveRequest, target);
      }
      return Response.json(
        {
          error: "Not Found",
          message:
            "This API is not available in production. Use /api/public/*, /api/admin/*, /api/files/*, /api/health, or /mcp.",
        },
        { status: 404 }
      );
    }

    if (isNonProductionUiToolPath(pathname)) {
      return new Response("Not Found", { status: 404 });
    }

    if (mode === "dev") {
      const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${sitePort}`);
      return proxyRequest(request, target);
    }

    if (!servePublicSite) {
      return new Response("Not Found", { status: 404 });
    }

    const staticFile = await resolveStaticAsset(pathname);
    if (staticFile) {
      return new Response(Bun.file(staticFile));
    }

    const notFoundPage = resolve(siteDistDir, "404.html");
    if (await fileExists(notFoundPage)) {
      return new Response(Bun.file(notFoundPage), { status: 404 });
    }

    return new Response("Not Found", { status: 404 });
  },
});

log("gateway ready", {
  mode,
  publicPort,
  nextPort,
  sitePort,
  adminPort,
  hostname,
  siteDistDir,
  adminDistDir,
});

const shutdown = () => {
  log("shutting down gateway");
  server.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
