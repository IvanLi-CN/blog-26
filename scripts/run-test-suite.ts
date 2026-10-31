import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { validateDrizzleJournal } from "./validate-drizzle-journal";

// CI test runner: run unit and integration tests excluding the `old/` directory
// This script discovers test files under common roots and invokes `bun test` with explicit file paths.
// It avoids running any tests under the `old/` directory.

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".astro",
  "dist",
  "build",
  "coverage",
  "test-results",
  "out",
  "dev-data",
  "test-data",
  "old",
  "e2e", // 排除 E2E 测试目录
]);

const ROOTS = ["src", "apps/admin/src", "tests", "tests/integration", "tests/lib", "tests/server"];
const EXPLICIT_TEST_FILES = [
  "scripts/package-public-media.test.ts",
  "scripts/verify-pages-build.test.ts",
];
const LINUX_ONLY_TESTS = new Set(["src/lib/ai/search-fallback.test.ts"]);

function isTestFile(filePath: string): boolean {
  return /(\.test|\.spec)\.(ts|tsx|js|jsx)$/.test(filePath);
}

function walk(dir: string, files: Set<string>) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // directory may not exist
  }

  for (const name of entries) {
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(full, files);
    } else if (st.isFile()) {
      if (isTestFile(full)) {
        files.add(full);
      }
    }
  }
}

async function main() {
  // Ensure the drizzle journal metadata remains monotonic before running tests
  validateDrizzleJournal();

  const fileSet = new Set<string>();

  const roots = ROOTS.filter((r) => existsSync(r));
  if (roots.length === 0) {
    console.error("No test roots found (src/, tests/)");
    process.exit(0);
  }

  for (const r of roots) walk(r, fileSet);
  for (const file of EXPLICIT_TEST_FILES) {
    if (existsSync(file)) fileSet.add(file);
  }

  const files = [...fileSet].sort();

  if (files.length === 0) {
    console.log("No matching test files found outside 'old/'. Skipping.");
    return;
  }

  // Ensure stable ordering and avoid re-running nested roots for reproducibility.
  const uniqueFiles = [...new Set(files)]
    .filter((file) => process.platform === "linux" || !LINUX_ONLY_TESTS.has(file))
    .sort();

  if (process.platform !== "linux") {
    console.log("Skipping Linux-native search integration tests on this platform.");
  }

  // Search/database tests use process-level DB_PATH state; isolate each file's module graph.
  const cmd = ["bun", "test", "--isolate", "--timeout=15000", ...uniqueFiles];
  console.log(`Running: ${cmd.join(" ")}`);

  // Use child_process to avoid relying on Bun global within pre-commit
  const { spawn } = await import("node:child_process");
  const [bin, ...args] = cmd;
  if (!bin) {
    console.error("No command to run");
    process.exit(1);
  }
  const {
    GIT_DIR: _gitDir,
    GIT_WORK_TREE: _gitWorkTree,
    GIT_INDEX_FILE: _gitIndexFile,
    GIT_COMMON_DIR: _gitCommonDir,
    ...testEnv
  } = process.env;
  const proc = spawn(bin, args, { stdio: "inherit", env: testEnv });
  const exitCode: number = await new Promise((resolve) => {
    proc.on("close", (code) => resolve(code ?? 1));
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
