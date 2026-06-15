#!/usr/bin/env bun

import { spawn } from "node:child_process";

type Step = {
  name: string;
  cmd: string[];
  env?: NodeJS.ProcessEnv;
};

function runStep(step: Step) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(step.cmd[0], step.cmd.slice(1), {
      stdio: "inherit",
      env: { ...process.env, ...step.env },
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.name} 失败，退出码 ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const env = {
    DB_PATH: "./test-data/sqlite.db",
    LOCAL_CONTENT_BASE_PATH: "./test-data/local",
    CONTENT_SOURCES: "local",
  };

  const steps: Step[] = [
    { name: "重置测试环境", cmd: ["bun", "run", "test-env:reset"], env },
    { name: "静态检查", cmd: ["bun", "run", "check"], env },
    { name: "单元测试", cmd: ["bun", "run", "test"], env },
    { name: "Canonical full E2E", cmd: ["bun", "run", "test:e2e"], env },
  ];

  for (const step of steps) {
    console.log(`\n== ${step.name} ==`);
    await runStep(step);
  }

  console.log("\n✅ CI workflow local-only 检查完成");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ test-ci-workflow 失败:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
