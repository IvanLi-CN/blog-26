#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

type Environment = "dev" | "test";

function parseEnvironment(): Environment {
  return process.argv.includes("--dev") ? "dev" : "test";
}

async function countFiles(dir: string) {
  if (!existsSync(dir)) return 0;
  return (await readdir(dir)).length;
}

async function main() {
  const environment = parseEnvironment();
  const baseDir = resolve(environment === "dev" ? "./dev-data" : "./test-data");
  const localDir = join(baseDir, "local");

  if (!existsSync(localDir)) {
    console.error(`❌ 本地测试数据目录不存在: ${localDir}`);
    process.exit(1);
  }

  const stats = {
    blog: await countFiles(join(localDir, "blog")),
    projects: await countFiles(join(localDir, "projects")),
    memos: await countFiles(join(localDir, "Memos")),
  };

  console.log(`✅ ${environment} 数据检查通过`);
  console.log(`  - blog: ${stats.blog}`);
  console.log(`  - projects: ${stats.projects}`);
  console.log(`  - memos: ${stats.memos}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ 校验测试数据失败:", error);
    process.exit(1);
  });
}
