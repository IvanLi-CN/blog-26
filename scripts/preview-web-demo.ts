#!/usr/bin/env bun
import { extname, resolve, sep } from "node:path";

export async function createWebDemoPreviewServer({
  siteRoot = resolve(process.env.WEB_DEMO_SITE_DIST_DIR || "web-demo-site-dist"),
  adminRoot = resolve(process.env.WEB_DEMO_ADMIN_DIST_DIR || "web-demo-admin-dist"),
  port = Number(process.env.WEB_DEMO_PORT || 25095),
} = {}) {
  const ssrEntry = resolve(siteRoot, "server", "entry.mjs");
  if (await Bun.file(ssrEntry).exists()) {
    const dataRoot = resolve(process.env.WEB_DEMO_DATA_DIR || "dev-data/web-demo");
    const upstreamProbe = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("", { status: 204 }),
    });
    const upstreamPort = upstreamProbe.port;
    upstreamProbe.stop(true);
    const child = Bun.spawn([process.execPath, ssrEntry], {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(upstreamPort),
        WEB_DEMO_BUILD: "true",
        PUBLIC_WEB_DEMO_BUILD: "true",
        CONSOLE_RUNTIME: "false",
        CONTENT_SOURCES: "local",
        PUBLIC_SNAPSHOT_PATH:
          process.env.PUBLIC_SNAPSHOT_PATH || resolve(dataRoot, "public-snapshot.json"),
        DB_PATH: process.env.DB_PATH || resolve(dataRoot, "sqlite.db"),
        LOCAL_CONTENT_BASE_PATH: process.env.LOCAL_CONTENT_BASE_PATH || resolve(dataRoot, "local"),
        PLAYBOOK_BUNDLE_DIR:
          process.env.PLAYBOOK_BUNDLE_DIR || resolve(dataRoot, "playbook-fixture"),
        PLAYBOOK_WORK_DIR: process.env.PLAYBOOK_WORK_DIR || resolve(dataRoot, "playbook-work"),
        PI_DURABLE_DB_PATH:
          process.env.PI_DURABLE_DB_PATH || resolve(dataRoot, "pi-durable.sqlite"),
        CLIPPING_CONTENT_BASE_PATH:
          process.env.CLIPPING_CONTENT_BASE_PATH || resolve(dataRoot, "clippings"),
        CLIPPING_PROCESSOR_ENABLED: "false",
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${upstreamPort}/memos/`);
        if (response.ok) break;
      } catch {
        // The standalone server needs a short startup window.
      }
      await Bun.sleep(50);
      if (attempt === 99) {
        child.kill();
        throw new Error("Web Demo SSR server did not become ready.");
      }
    }
    const proxy = Bun.serve({
      hostname: "127.0.0.1",
      port,
      async fetch(request) {
        const url = new URL(request.url);
        const routeData = url.pathname === "/api/public/page" && request.method === "GET";
        if ((url.pathname === "/api" || url.pathname.startsWith("/api/")) && !routeData)
          return new Response("No live API in Web Demo", { status: 404 });
        const upstream = new URL(url.pathname + url.search, `http://127.0.0.1:${upstreamPort}`);
        return fetch(upstream, request);
      },
    });
    return {
      port: proxy.port,
      async stop(force = false) {
        proxy.stop(force);
        child.kill();
        await child.exited;
      },
    };
  }

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
