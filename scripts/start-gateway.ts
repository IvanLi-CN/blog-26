import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { getSsoEmailHeaderName } from "@/lib/admin-config";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import { handleAdminApiRequest } from "@/server/admin-api/router";
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
const localPreviewSsoEmail = process.env.LOCAL_PREVIEW_SSO_EMAIL?.trim();

let nextProcess: ChildProcess | null = null;

function log(message: string, extra?: Record<string, unknown>) {
  if (extra) {
    console.log(`[gateway] ${message}`, extra);
  } else {
    console.log(`[gateway] ${message}`);
  }
}

function toAbsolutePath(input: string | undefined) {
  if (!input) return input;
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

function isPublicApiPath(pathname: string) {
  return pathname === "/api/public" || pathname.startsWith("/api/public/");
}

function isAdminApiPath(pathname: string) {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isPreviewableContentPath(pathname: string) {
  return pathname.startsWith("/posts/") || pathname.startsWith("/memos/");
}

function isAdminPreviewRequest(pathname: string, searchParams: URLSearchParams) {
  return isPreviewableContentPath(pathname) && searchParams.get("admin-preview") === "1";
}

function isLegacyPath(pathname: string) {
  if (pathname === "/api") return true;
  if (
    pathname.startsWith("/api/") &&
    !isPublicApiPath(pathname) &&
    !isAdminApiPath(pathname) &&
    pathname !== "/api/health"
  ) {
    return true;
  }

  const legacyPrefixes = [
    "/_next",
    "/mcp",
    "/dev",
    "/theme-test",
    "/test-editor",
    "/demo-integration",
    "/demo-memo-card",
  ];

  return legacyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
    pathname === "/api/files" ||
    pathname.startsWith("/api/files/") ||
    pathname === "/api/tags/organize" ||
    pathname.startsWith("/api/tags/organize/") ||
    isLegacyPath(pathname) ||
    isAdminPreviewRequest(pathname, searchParams)
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

function withAdminPreviewHeader(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("x-admin-preview", "1");
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

async function checkNextHealth() {
  try {
    const response = await fetch(`http://${internalHostname}:${nextPort}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function startInternalNextIfNeeded() {
  if (mode !== "production") return;
  if (process.env.GATEWAY_SPAWN_INTERNAL_NEXT === "false") return;
  if (nextProcess) return;

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(nextPort),
    HOSTNAME: internalHostname,
    DB_PATH: toAbsolutePath(process.env.DB_PATH),
    LOCAL_CONTENT_BASE_PATH: toAbsolutePath(process.env.LOCAL_CONTENT_BASE_PATH),
    PUBLIC_SNAPSHOT_PATH: toAbsolutePath(process.env.PUBLIC_SNAPSHOT_PATH),
  };
  const standaloneServer = resolve(process.cwd(), "server.js");
  const localStandaloneServer = resolve(process.cwd(), ".next/standalone/server.js");
  const command =
    process.env.INTERNAL_NEXT_COMMAND?.trim() ||
    (existsSync(standaloneServer)
      ? "bun server.js"
      : existsSync(localStandaloneServer)
        ? "bun .next/standalone/server.js"
        : "bun --bun next start");

  log("starting internal legacy Next", { nextPort, command });
  nextProcess = spawn("sh", ["-lc", command], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  nextProcess.on("exit", (code, signal) => {
    log("internal legacy Next exited", { code, signal });
    nextProcess = null;
  });
}

function stopInternalNext() {
  if (!nextProcess || nextProcess.exitCode !== null) return;
  nextProcess.kill("SIGTERM");
}

startInternalNextIfNeeded();

const server = Bun.serve({
  hostname,
  port: publicPort,
  fetch: async (request) => {
    const url = new URL(request.url);
    const { pathname, search, searchParams } = url;
    const effectiveRequest = withLocalPreviewIdentity(request, pathname, searchParams);

    if (pathname === "/api/health") {
      const [siteHealthy, adminHealthy, nextHealthy] = await Promise.all([
        checkSiteHealth(),
        checkAdminHealth(),
        checkNextHealth(),
      ]);
      const status = siteHealthy && adminHealthy && nextHealthy ? 200 : 503;
      return Response.json(
        {
          status: status === 200 ? "ok" : "degraded",
          mode,
          gateway: { status: "ok", port: publicPort },
          site: {
            status: siteHealthy ? "ok" : "down",
            mode: mode === "production" ? "static" : "proxy",
            target: mode === "production" ? siteDistDir : `http://${internalHostname}:${sitePort}`,
          },
          legacyNext: {
            status: nextHealthy ? "ok" : "down",
            target: `http://${internalHostname}:${nextPort}`,
          },
          admin: {
            status: adminHealthy ? "ok" : "down",
            mode: mode === "production" ? "static" : "proxy",
            target:
              mode === "production" ? adminDistDir : `http://${internalHostname}:${adminPort}`,
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

    if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
      return renderHtmlStatusPage(
        404,
        "Admin login removed",
        "This deployment no longer serves a standalone admin login page."
      );
    }

    if (isAdminPreviewRequest(pathname, searchParams)) {
      const previewRequest = withAdminPreviewHeader(effectiveRequest);
      const isHtmlRequest = isHtmlNavigationRequest(previewRequest, pathname);

      if (isHtmlRequest) {
        const auth = await extractAuthFromRequest(previewRequest);
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

      const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${nextPort}`);
      return proxyRequest(previewRequest, target);
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

    if (isLegacyPath(pathname)) {
      const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${nextPort}`);
      return proxyRequest(effectiveRequest, target);
    }

    if (mode === "dev") {
      const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${sitePort}`);
      return proxyRequest(request, target);
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
  stopInternalNext();
  server.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
