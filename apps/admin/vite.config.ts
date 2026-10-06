import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const adminPort = Number(process.env.ADMIN_PORT || 25094);
const adminOutDir = process.env.ADMIN_OUT_DIR || "admin-dist";
const webDemoInspectorModule =
  process.env.VITE_WEB_DEMO_BUILD === "true"
    ? resolve(repoRoot, "src/components/WebDemoInspector.tsx")
    : resolve(repoRoot, "src/components/WebDemoInspector.disabled.tsx");

export default defineConfig({
  root: appRoot,
  base: "/admin/",
  cacheDir: resolve(repoRoot, "node_modules/.vite-admin"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/components/WebDemoInspector", replacement: webDemoInspectorModule },
      { find: "@", replacement: resolve(repoRoot, "src") },
      { find: "~", replacement: resolve(appRoot, "src") },
    ],
  },
  server: {
    host: "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      clientPort: adminPort,
    },
    port: adminPort,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: adminPort,
    strictPort: true,
  },
  build: {
    outDir: resolve(repoRoot, adminOutDir),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        app: resolve(appRoot, "index.html"),
      },
    },
  },
});
