import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import { startClippingRuntime, stopClippingRuntime } from "@/server/clipping/runtime";
import { handleVersionRequest, readRuntimeVersionInfo } from "@/server/version-api";

const versionInfo = await readRuntimeVersionInfo(
  new URL("../src/generated/version.json", import.meta.url),
  process.env.NODE_ENV === "production"
);

const port = Number(process.env.PORT || 25090);
const hostname = process.env.BIND_HOST || "0.0.0.0";
const adminDistDir = resolve(process.cwd(), process.env.ADMIN_DIST_DIR || "admin-dist");
const consoleClientDir = resolve(
  process.cwd(),
  process.env.CONSOLE_DIST_DIR || "console-dist",
  "client"
);

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function adminPathname(pathname: string) {
  return pathname.replace(/^\/admin\/?/, "");
}

function resolveAdminFile(pathname: string) {
  const relative = adminPathname(pathname) || "index.html";
  const candidate = resolve(adminDistDir, relative);
  return candidate.startsWith(`${adminDistDir}/`) ? candidate : null;
}

function isAdminAssetRequest(pathname: string) {
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

function renderHtmlStatusPage(status: number, title: string, message: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`,
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    }
  );
}

function toAuthRequest(request: import("node:http").IncomingMessage, url: URL) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
  }
  return new Request(url, { method: request.method || "GET", headers });
}

function resolveConsoleFile(pathname: string) {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
  const candidate = resolve(consoleClientDir, relative);
  return candidate.startsWith(`${consoleClientDir}/`) ? candidate : null;
}

async function serveConsoleStatic(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  pathname: string
) {
  const candidate = resolveConsoleFile(pathname);
  if (!candidate) return false;

  const info = await stat(candidate).catch(() => null);
  if (!info?.isFile()) return false;

  response.writeHead(200, {
    "cache-control": pathname.startsWith("/_astro/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
    "content-length": info.size,
    "content-type": contentTypes[extname(candidate)] || "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    createReadStream(candidate).pipe(response);
  }
  return true;
}

async function serveAdmin(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  url: URL
) {
  const pathname = url.pathname;
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    const status = renderHtmlStatusPage(
      404,
      "Admin login removed",
      "This deployment no longer serves a standalone admin login page."
    );
    response.writeHead(status.status, Object.fromEntries(status.headers));
    response.end(await status.text());
    return true;
  }

  if (!isAdminAssetRequest(pathname)) {
    const auth = await extractAuthFromRequest(toAuthRequest(request, url));
    if (!auth.user) {
      const status = renderHtmlStatusPage(
        401,
        "Authentication required",
        "Open the admin area with a valid development session or SSO identity."
      );
      response.writeHead(status.status, Object.fromEntries(status.headers));
      response.end(await status.text());
      return true;
    }
    if (!auth.isAdmin) {
      const status = renderHtmlStatusPage(
        403,
        "Admin access denied",
        "Your current account is signed in, but it does not have administrator privileges."
      );
      response.writeHead(status.status, Object.fromEntries(status.headers));
      response.end(await status.text());
      return true;
    }
  }

  if (pathname === "/admin") {
    response.writeHead(308, { location: "/admin/" });
    response.end();
    return true;
  }

  const candidate = resolveAdminFile(pathname);
  if (!candidate) return false;

  let filePath = candidate;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    if (extname(adminPathname(pathname))) {
      response.writeHead(404);
      response.end("Not Found");
      return true;
    }
    filePath = resolve(adminDistDir, "index.html");
  }

  try {
    const info = await stat(filePath);
    response.writeHead(200, {
      "cache-control": filePath.endsWith("index.html")
        ? "no-store"
        : "public, max-age=31536000, immutable",
      "x-robots-tag": "noindex, nofollow",
      "content-length": info.size,
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(503);
    response.end("Admin frontend is not built");
  }
  return true;
}

const astro = await import("../console-dist/server/entry.mjs");
await startClippingRuntime();
const playbook = getRuntimePlaybookStore();
await playbook.load();
if (
  process.env.PLAYBOOK_SYNC_ENABLED === "true" ||
  (process.env.NODE_ENV === "production" && process.env.PLAYBOOK_SYNC_ENABLED !== "false")
)
  playbook.start();
const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/version") {
    const result = handleVersionRequest(
      new Request(url, { method: request.method || "GET" }),
      versionInfo
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
    return;
  }
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    await serveAdmin(request, response, url);
    return;
  }

  if (await serveConsoleStatic(request, response, url.pathname)) return;

  astro.handler(request, response);
});

async function shutdown() {
  playbook.stop();
  const deadline = setTimeout(() => process.exit(1), 5000);
  deadline.unref();
  await stopClippingRuntime();
  server.close(() => {
    clearTimeout(deadline);
    process.exit(0);
  });
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

server.listen(port, hostname, () => {
  const address = server.address();
  const listeningPort = address && typeof address !== "string" ? address.port : port;
  console.log(`[console] listening on http://${hostname}:${listeningPort}`);
});
