import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";

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
  _request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  pathname: string
) {
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
const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    await serveAdmin(request, response, url.pathname);
    return;
  }

  if (await serveConsoleStatic(request, response, url.pathname)) return;

  astro.handler(request, response);
});

server.listen(port, hostname, () => {
  console.log(`[console] listening on http://${hostname}:${port}`);
});
