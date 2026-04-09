import { resolve } from "node:path";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const sitePort = Number(process.env.SITE_PORT || 25093);
const siteHost = process.env.SITE_HOST || "127.0.0.1";
const astroCacheDir = process.env.ASTRO_CACHE_DIR || "./.astro";
const viteCacheDir = process.env.VITE_CACHE_DIR || "./node_modules/.vite";

export default defineConfig({
  integrations: [react()],
  output: "static",
  srcDir: "./site",
  outDir: "./site-dist",
  cacheDir: astroCacheDir,
  server: {
    host: siteHost,
    port: sitePort,
  },
  vite: {
    cacheDir: viteCacheDir,
    server: {
      hmr: {
        host: siteHost,
        clientPort: sitePort,
        protocol: "ws",
      },
    },
    resolve: {
      alias: {
        "@": resolve("./src"),
      },
    },
    define: {
      "process.env.NEXT_PUBLIC_LUOSIMAO_SITE_KEY": JSON.stringify(
        process.env.NEXT_PUBLIC_LUOSIMAO_SITE_KEY ?? process.env.PUBLIC_LUOSIMAO_SITE_KEY ?? ""
      ),
      "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(
        process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? ""
      ),
    },
  },
});
