import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const adminPort = Number(process.env.ADMIN_PORT || 25094);

export default defineConfig({
  root: appRoot,
  base: "/admin/",
  cacheDir: resolve(repoRoot, "node_modules/.vite-admin"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(repoRoot, "src"),
      "~": resolve(appRoot, "src"),
    },
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
    outDir: resolve(repoRoot, "admin-dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
