#!/usr/bin/env bun

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

type Environment = "dev" | "test";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8JrWQAAAABJRU5ErkJggg==",
  "base64"
);

function parseEnvironment(): { environment: Environment; cleanOnly: boolean } {
  const args = process.argv.slice(2);
  const environment: Environment = args.includes("--dev") ? "dev" : "test";
  const cleanOnly = args.includes("--clean");
  return { environment, cleanOnly };
}

function getBaseDir(environment: Environment) {
  return resolve(environment === "dev" ? "./dev-data" : "./test-data");
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

async function writeTextFile(path: string, content: string) {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf-8");
}

async function writeBinaryFile(path: string, content: Buffer) {
  await ensureDir(dirname(path));
  await writeFile(path, content);
}

function markdown(frontmatter: Record<string, unknown>, body: string) {
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join("\n");
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

async function createFixtureData(baseDir: string) {
  const localDir = join(baseDir, "local");
  const codeFixtureReturnLine = `  return \`hello ${"name"}\`;`;

  await ensureDir(join(localDir, "blog", "assets"));
  await ensureDir(join(localDir, "projects", "assets"));
  await ensureDir(join(localDir, "Memos", "assets"));

  await writeTextFile(
    join(localDir, "blog", "hello-world.md"),
    markdown(
      {
        title: "Hello World",
        publishDate: "2026-01-01T00:00:00.000Z",
        public: true,
        tags: ["intro", "local"],
        category: "notes",
      },
      "# Hello World\n\n![tiny](./assets/hello.png)\n\nThis is the primary local fixture post."
    )
  );

  await writeTextFile(
    join(localDir, "blog", "code-block-fixture.md"),
    markdown(
      {
        title: "Code Block Fixture",
        publishDate: "2026-01-01T12:00:00.000Z",
        public: true,
        tags: ["code", "fixture", "local"],
        category: "notes",
      },
      [
        "# Code Block Fixture",
        "",
        "This fixture exists for canonical full E2E coverage of markdown code rendering.",
        "",
        "```js",
        'const tiny = "fixture";',
        "function greet(name) {",
        codeFixtureReturnLine,
        "}",
        "console.log(greet(tiny));",
        "```",
        "",
        "Inline code should also render: `tiny`.",
      ].join("\n")
    )
  );

  await writeTextFile(
    join(localDir, "projects", "sample-project.md"),
    markdown(
      {
        title: "Sample Project",
        publishDate: "2026-01-02T00:00:00.000Z",
        public: true,
        tags: ["project"],
        category: "hardware",
      },
      "# Sample Project\n\nProject fixture content."
    )
  );

  await writeTextFile(
    join(localDir, "Memos", "20260103_local-memo.md"),
    markdown(
      {
        title: "Local Memo",
        publishDate: "2026-01-03T00:00:00.000Z",
        public: true,
        tags: ["memo", "local"],
      },
      "# Local Memo\n\nA memo fixture stored in the local content tree."
    )
  );

  await writeBinaryFile(join(localDir, "blog", "assets", "hello.png"), TINY_PNG);
  await writeBinaryFile(join(localDir, "projects", "assets", "project.png"), TINY_PNG);
  await writeBinaryFile(join(localDir, "Memos", "assets", "memo.png"), TINY_PNG);
  await writeTextFile(
    join(localDir, "blog", "assets", "diagram.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#6b8f71"/></svg>\n'
  );
}

async function cleanData(baseDir: string) {
  await rm(baseDir, { recursive: true, force: true });
}

async function cleanFixtureData(baseDir: string) {
  await rm(join(baseDir, "local"), { recursive: true, force: true });
}

async function main() {
  const { environment, cleanOnly } = parseEnvironment();
  const baseDir = getBaseDir(environment);

  if (cleanOnly) {
    await cleanData(baseDir);
    console.log(`🧹 已清理 ${environment} 数据目录: ${baseDir}`);
    return;
  }

  await cleanFixtureData(baseDir);
  await createFixtureData(baseDir);

  console.log(`✅ 已生成 ${environment} 本地测试数据`);
  console.log(`  - local: ${join(baseDir, "local")}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ 生成测试数据失败:", error);
    process.exit(1);
  });
}
