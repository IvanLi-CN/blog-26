import { resolve } from "node:path";
import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const sitePort = Number(process.env.SITE_PORT || 25093);
const siteHost = process.env.SITE_HOST || "127.0.0.1";
const astroCacheDir = process.env.ASTRO_CACHE_DIR || "./.astro";
const viteCacheDir = process.env.VITE_CACHE_DIR || "./node_modules/.vite";
const configuredSiteUrl = process.env.PUBLIC_SITE_URL ?? "";
const configuredSiteBasePath = process.env.PUBLIC_SITE_BASE_PATH ?? "";
const consoleRuntime = process.env.CONSOLE_RUNTIME === "true";
const webDemoRuntime = process.env.WEB_DEMO_BUILD === "true";
const serverRuntime = consoleRuntime || webDemoRuntime;
const astroOutDir =
  process.env.ASTRO_OUT_DIR ||
  (consoleRuntime ? "./console-dist" : webDemoRuntime ? "./web-demo-site-dist" : "./site-dist");

function normalizeBasePath(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const normalized = withLeadingSlash.replace(/\/+$/, "");
  return normalized === "/" ? "" : normalized;
}

function deriveBasePathFromSiteUrl(rawSiteUrl) {
  const siteUrl = typeof rawSiteUrl === "string" ? rawSiteUrl.trim() : "";
  if (!siteUrl) return "";

  try {
    return normalizeBasePath(new URL(siteUrl).pathname);
  } catch {
    return "";
  }
}

function resolveAstroSite(rawSiteUrl, rawBasePath) {
  const siteUrl = typeof rawSiteUrl === "string" ? rawSiteUrl.trim() : "";
  if (!siteUrl) return undefined;

  try {
    const url = new URL(siteUrl);
    const basePath = normalizeBasePath(rawBasePath);
    if (basePath && (url.pathname === basePath || url.pathname === `${basePath}/`)) {
      url.pathname = "/";
      url.search = "";
      url.hash = "";
    }
    return url.toString();
  } catch {
    return siteUrl;
  }
}

const astroBasePath =
  normalizeBasePath(configuredSiteBasePath) || deriveBasePathFromSiteUrl(configuredSiteUrl);
const astroSiteUrl = resolveAstroSite(configuredSiteUrl, astroBasePath);
const memoAuthoringModule = "@console-memo-authoring";
const memoAuthoringImplementation = resolve("./site/components/PublicMemoAuthoring.tsx");
const memoAuthoringPublicStub = resolve("./site/components/PublicMemoAuthoring.public.tsx");
const webDemoInspectorModule =
  process.env.WEB_DEMO_BUILD === "true"
    ? resolve("./src/components/WebDemoInspector.tsx")
    : resolve("./src/components/WebDemoInspector.disabled.tsx");
const clippingReaderModule =
  process.env.WEB_DEMO_BUILD === "true"
    ? resolve("./site/components/ClippingWebDemo.tsx")
    : resolve("./src/components/memos/ClippingDetail.tsx");

export default defineConfig({
  integrations: [react(), mdx()],
  adapter: serverRuntime ? node({ mode: webDemoRuntime ? "standalone" : "middleware" }) : undefined,
  output: serverRuntime ? "server" : "static",
  trailingSlash: serverRuntime ? "ignore" : "always",
  srcDir: "./site",
  outDir: astroOutDir,
  site: astroSiteUrl,
  base: astroBasePath || undefined,
  cacheDir: astroCacheDir,
  server: {
    host: siteHost,
    port: sitePort,
  },
  vite: {
    plugins: [tailwindcss()],
    cacheDir: viteCacheDir,
    server: {
      hmr: {
        host: siteHost,
        clientPort: sitePort,
        protocol: "ws",
      },
      watch: {
        ignored: [
          "**/.astro-web-demo/**",
          "**/.astro-web-demo-dev/**",
          "**/web-demo-site-dist/**",
          "**/web-demo-site-dev-dist/**",
          "**/web-demo-admin-dist/**",
        ],
      },
    },
    resolve: {
      alias: [
        { find: "@clipping-reader", replacement: clippingReaderModule },
        { find: "@/components/WebDemoInspector", replacement: webDemoInspectorModule },
        { find: "@", replacement: resolve("./src") },
        {
          find: memoAuthoringModule,
          replacement: consoleRuntime ? memoAuthoringImplementation : memoAuthoringPublicStub,
        },
      ],
    },
    define: {
      "process.env.PUBLIC_LUOSIMAO_SITE_KEY": JSON.stringify(
        process.env.PUBLIC_LUOSIMAO_SITE_KEY ?? ""
      ),
      "process.env.PUBLIC_API_BASE_URL": JSON.stringify(process.env.PUBLIC_API_BASE_URL ?? ""),
      "process.env.CONSOLE_RUNTIME": JSON.stringify(process.env.CONSOLE_RUNTIME ?? ""),
      "process.env.WEB_DEMO_BUILD": JSON.stringify(process.env.WEB_DEMO_BUILD ?? ""),
      "process.env.PUBLIC_WEB_DEMO_BUILD": JSON.stringify(process.env.PUBLIC_WEB_DEMO_BUILD ?? ""),
      "process.env.PUBLIC_SITE_URL": JSON.stringify(process.env.PUBLIC_SITE_URL ?? ""),
      "process.env.PUBLIC_SITE_BASE_PATH": JSON.stringify(process.env.PUBLIC_SITE_BASE_PATH ?? ""),
      "process.env.PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL": JSON.stringify(
        process.env.PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL ?? ""
      ),
      "process.env.PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL": JSON.stringify(
        process.env.PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL ?? ""
      ),
      "process.env.PUBLIC_OCTO_RILL_METRICS_BASE_URL": JSON.stringify(
        process.env.PUBLIC_OCTO_RILL_METRICS_BASE_URL ?? ""
      ),
    },
  },
});
