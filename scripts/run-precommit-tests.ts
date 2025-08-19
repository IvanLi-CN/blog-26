import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Pre-commit test runner: run unit tests excluding the `old/` directory
// This script discovers test files under common roots and invokes `bun test` with explicit file paths.
// It avoids running any tests under the `old/` directory.

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "test-results",
  "out",
  "dev-data",
  "test-data",
  "old",
]);

const ROOTS = ["src", "tests", "tests/integration", "tests/lib", "tests/server"];

function isTestFile(filePath: string): boolean {
  return /(\.test|\.spec)\.(ts|tsx|js|jsx)$/.test(filePath);
}

function walk(dir: string, files: string[]) {
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
        files.push(full);
      }
    }
  }
}

async function main() {
  const files: string[] = [];

  const roots = ROOTS.filter((r) => existsSync(r));
  if (roots.length === 0) {
    console.error("No test roots found (src/, tests/)");
    process.exit(0);
  }

  for (const r of roots) walk(r, files);

  if (files.length === 0) {
    console.log("No matching test files found outside 'old/'. Skipping.");
    return;
  }

  // Ensure stable ordering for reproducibility
  files.sort();

  const cmd = ["bun", "test", ...files];
  console.log(`Running: ${cmd.join(" ")}`);

  // Use child_process to avoid relying on Bun global within pre-commit
  const { spawn } = await import("node:child_process");
  const [bin, ...args] = cmd;
  if (!bin) {
    console.error("No command to run");
    process.exit(1);
  }
  const proc = spawn(bin, args, { stdio: "inherit" });
  const exitCode: number = await new Promise((resolve) => {
    proc.on("close", (code) => resolve(code ?? 1));
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
