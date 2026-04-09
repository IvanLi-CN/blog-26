import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { handlePublicApiRequest } from "@/server/public-api/router";

type GatewayMode = "dev" | "production";

const mode = (process.env.NODE_ENV === "production" ? "production" : "dev") as GatewayMode;
const publicPort = Number(process.env.PORT || 25090);
const nextPort = Number(process.env.INTERNAL_NEXT_PORT || publicPort + 2);
const sitePort = Number(process.env.SITE_PORT || publicPort + 3);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const internalHostname = process.env.INTERNAL_HOSTNAME || "127.0.0.1";
const siteDistDir = resolve(process.cwd(), process.env.SITE_DIST_DIR || "site-dist");

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

function isLegacyPath(pathname: string) {
  if (pathname === "/api") return true;
  if (pathname.startsWith("/api/") && !isPublicApiPath(pathname) && pathname !== "/api/health") {
    return true;
  }

  const legacyPrefixes = [
    "/admin",
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
    const internalOrigin = `http://${internalHostname}:${nextPort}`;
    if (location.startsWith(internalOrigin)) {
      responseHeaders.set("location", location.replace(internalOrigin, requestUrl.origin));
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
    const { pathname, search } = url;

    if (pathname === "/api/health") {
      const [siteHealthy, nextHealthy] = await Promise.all([checkSiteHealth(), checkNextHealth()]);
      const status = siteHealthy && nextHealthy ? 200 : 503;
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
      return handlePublicApiRequest(request, subPath);
    }

    if (isLegacyPath(pathname)) {
      const target = new URL(`${pathname}${search}`, `http://${internalHostname}:${nextPort}`);
      return proxyRequest(request, target);
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
  hostname,
  siteDistDir,
});

const shutdown = () => {
  log("shutting down gateway");
  stopInternalNext();
  server.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
