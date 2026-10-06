#!/usr/bin/env bun
import { extname, resolve, sep } from "node:path";

export async function createWebDemoPreviewServer({
  siteRoot = resolve(process.env.WEB_DEMO_SITE_DIST_DIR || "web-demo-site-dist"),
  adminRoot = resolve(process.env.WEB_DEMO_ADMIN_DIST_DIR || "web-demo-admin-dist"),
  port = Number(process.env.WEB_DEMO_PORT || 25095),
} = {}) {
  const siteEntry = Bun.file(resolve(siteRoot, "index.html"));
  if (
    !(await siteEntry.exists()) ||
    !(await siteEntry.text()).includes("data-web-demo-inspector-root")
  )
    throw new Error("Build the separate Web Demo artifact before previewing it.");
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      // This server is static-only. Unknown requests never fall back to the gateway.
      if (pathname === "/api" || pathname.startsWith("/api/"))
        return new Response("No live API in Web Demo", { status: 404 });
      const admin = pathname === "/admin" || pathname.startsWith("/admin/");
      const root = resolve(admin ? adminRoot : siteRoot);
      const relativePath = admin ? pathname.slice("/admin".length) || "/" : pathname;
      const candidate = resolve(
        root,
        `.${relativePath}`,
        relativePath.endsWith("/") ? "index.html" : ""
      );
      if (!candidate.startsWith(`${root}${sep}`)) return new Response("Forbidden", { status: 403 });
      let file = Bun.file(candidate);
      if (!(await file.exists())) file = Bun.file(resolve(candidate, "index.html"));
      if (!(await file.exists()) && admin && !extname(relativePath))
        file = Bun.file(resolve(root, "index.html"));
      return (await file.exists())
        ? new Response(file)
        : new Response("Not found", { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = await createWebDemoPreviewServer();
  console.log(`Web Demo: http://127.0.0.1:${server.port}/memos/`);
  console.log(
    `Clipping: http://127.0.0.1:${server.port}/memos/memo-web-demo-1181/?d_persona=admin`
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      server.stop(true);
      process.exit(0);
    });
}
