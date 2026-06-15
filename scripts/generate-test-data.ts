#!/usr/bin/env bun

import { existsSync, realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

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
  const configuredRoot = process.env.LOCAL_CONTENT_BASE_PATH?.trim();
  if (configuredRoot) {
    return resolve(configuredRoot);
  }

  if (environment === "dev") {
    return resolve("./dev-data/local");
  }
  return resolve("./test-data/local");
}

function getManagedRoot(environment: Environment) {
  return environment === "dev" ? resolve("./dev-data") : resolve("./test-data");
}

function canonicalizePath(path: string): string {
  const resolved = resolve(path);
  if (existsSync(resolved)) {
    return realpathSync(resolved);
  }

  const parent = dirname(resolved);
  if (existsSync(parent)) {
    return join(realpathSync(parent), resolved.slice(parent.length + 1));
  }

  return resolved;
}

function isStrictChildPath(parent: string, candidate: string) {
  const rel = relative(parent, candidate);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function assertManagedFixtureRoot(environment: Environment, baseDir: string) {
  const managedRoot = canonicalizePath(getManagedRoot(environment));
  const candidateRoot = canonicalizePath(baseDir);
  if (isStrictChildPath(managedRoot, candidateRoot)) {
    return;
  }

  const syncCommand =
    environment === "dev" ? "bun run dev-sync:trigger" : "bun run test-sync:trigger";
  throw new Error(
    `Refusing to manage ${environment} fixtures outside ${managedRoot}/*: ${candidateRoot}. ` +
      `Use ${syncCommand} for existing local content roots.`
  );
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
  const codeFixtureReturnLine = `  return \`hello ${"name"}\`;`;

  await ensureDir(join(baseDir, "blog", "assets"));
  await ensureDir(join(baseDir, "projects", "assets"));
  await ensureDir(join(baseDir, "Memos", "assets"));

  await writeTextFile(
    join(baseDir, "blog", "hello-world.md"),
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
    join(baseDir, "blog", "code-block-fixture.md"),
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
    join(baseDir, "projects", "sample-project.md"),
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
    join(baseDir, "Memos", "20260103_local-memo.md"),
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

  await writeBinaryFile(join(baseDir, "blog", "assets", "hello.png"), TINY_PNG);
  await writeBinaryFile(join(baseDir, "projects", "assets", "project.png"), TINY_PNG);
  await writeBinaryFile(join(baseDir, "Memos", "assets", "memo.png"), TINY_PNG);
  await writeTextFile(
    join(baseDir, "blog", "assets", "diagram.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#6b8f71"/></svg>\n'
  );
}

async function cleanData(environment: Environment) {
  await rm(getManagedRoot(environment), { recursive: true, force: true });
}

async function cleanFixtureData(baseDir: string) {
  await rm(baseDir, { recursive: true, force: true });
}

async function main() {
  const { environment, cleanOnly } = parseEnvironment();
  const baseDir = getBaseDir(environment);
  assertManagedFixtureRoot(environment, baseDir);

  if (cleanOnly) {
    await cleanData(environment);
    console.log(`🧹 已清理 ${environment} 数据目录: ${getManagedRoot(environment)}`);
    return;
  }

  await cleanFixtureData(baseDir);
  await createFixtureData(baseDir);

  console.log(`✅ 已生成 ${environment} 本地测试数据`);
  console.log(`  - local: ${baseDir}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ 生成测试数据失败:", error);
    process.exit(1);
  });
}
