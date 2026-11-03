#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const distDir = resolve(process.cwd(), process.env.CONSOLE_DIST_DIR || "console-dist");
const serverDir = join(distDir, "server");
const entryPath = join(serverDir, "entry.mjs");
const entry = await readFile(entryPath, "utf8");

if (!entry.includes('"adapterName":"@astrojs/node"')) {
  throw new Error(`Console build is not an Astro Node SSR artifact: ${entryPath}`);
}
for (const route of ['"route":"/mcp"', '"route":"/api/[...path]"']) {
  if (!entry.includes(route)) throw new Error(`Console build is missing route metadata: ${route}`);
}

const serverFiles: string[] = [];
const glob = new Bun.Glob("**/*.mjs");
for await (const file of glob.scan({ cwd: serverDir, absolute: true })) serverFiles.push(file);

for (const file of serverFiles) {
  const source = await readFile(file, "utf8");
  if (source.includes("process.env.BLOG_BUILD_TARGET")) {
    throw new Error(`Console build still reads BLOG_BUILD_TARGET at startup: ${file}`);
  }
}

console.log(
  `Verified console build target is embedded in ${serverFiles.length} SSR modules; startup does not read BLOG_BUILD_TARGET.`
);
