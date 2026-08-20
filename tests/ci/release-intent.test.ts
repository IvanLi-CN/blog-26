import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT_PATH = path.resolve(process.cwd(), ".github/scripts/release-intent.sh");
const tempDirs: string[] = [];

async function createCurlFixture(branchHeadSha: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "blog26-release-intent-"));
  tempDirs.push(dir);

  const binDir = path.join(dir, "bin");
  const outputPath = path.join(dir, "github-output.txt");
  await mkdir(binDir, { recursive: true });
  await Bun.write(outputPath, "");
  await Bun.write(
    path.join(binDir, "curl"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [[ "$*" == *"/git/ref/heads/main" ]]; then',
      `  printf '%s\\n' '{"object":{"sha":"${branchHeadSha}"}}'`,
      "  exit 0",
      "fi",
      'echo "unexpected curl request: $*" >&2',
      "exit 99",
      "",
    ].join("\n")
  );
  await chmod(path.join(binDir, "curl"), 0o755);

  return { binDir, outputPath };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("release-intent.sh", () => {
  test("rejects a release SHA that is not the current main head before resolving PR labels", async () => {
    const mainHeadSha = "a".repeat(40);
    const requestedSha = "b".repeat(40);
    const { binDir, outputPath } = await createCurlFixture(mainHeadSha);

    const result = spawnSync("bash", [SCRIPT_PATH], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: `${binDir}:${process.env.PATH}`,
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "IvanLi-CN/blog-26",
        GITHUB_TOKEN: "test-token",
        TARGET_BRANCH: "main",
        WORKFLOW_RUN_SHA: requestedSha,
      },
    });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain("release_head_must_match_current_main");
    expect(await readFile(outputPath, "utf8")).toContain(
      "reason=release_head_must_match_current_main"
    );
  });
});
