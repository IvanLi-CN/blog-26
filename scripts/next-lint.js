#!/usr/bin/env node
// Lightweight Next.js lint wrapper: runs `next lint` only when ESLint and a config exist.
// This repo primarily uses Biome; CI still calls `bun run lint` to satisfy Next.js lint step.

const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

function hasEslint() {
  try {
    require.resolve("eslint");
    return true;
  } catch {
    return false;
  }
}

function hasEslintConfig() {
  const cwd = process.cwd();
  const candidates = [
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.yaml",
    ".eslintrc.yml",
  ];
  const hasFile = candidates.some((f) => existsSync(resolve(cwd, f)));
  if (hasFile) return true;
  try {
    const pkg = require(resolve(cwd, "package.json"));
    return Boolean(pkg?.eslintConfig);
  } catch {
    return false;
  }
}

if (!hasEslint() || !hasEslintConfig()) {
  console.log("[lint] ESLint or config not present; skipping Next.js lint.");
  process.exit(0);
}

const proc = spawnSync("bun", ["--bun", "next", "lint"], { stdio: "inherit" });
process.exit(proc.status ?? 1);
