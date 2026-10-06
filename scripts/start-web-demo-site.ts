#!/usr/bin/env bun
import { resolve } from "node:path";
import { prepareWebDemoInputs } from "./build-web-demo";

const env = await prepareWebDemoInputs();
env.ASTRO_OUT_DIR = "web-demo-site-dev-dist";
env.ASTRO_CACHE_DIR = ".astro-web-demo-dev";
env.VITE_CACHE_DIR = "node_modules/.vite-web-demo-dev";
const child = Bun.spawn(
  [
    "bun",
    "x",
    "astro",
    "dev",
    "--ignore-lock",
    "--host",
    "127.0.0.1",
    "--port",
    env.SITE_PORT || "25093",
  ],
  {
    cwd: resolve(import.meta.dir, ".."),
    env,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  }
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
process.exit(await child.exited);
