import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT_PATH = path.resolve(process.cwd(), ".github/scripts/compute-version.sh");
const tempDirs: string[] = [];

async function createTempRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), "blog25-compute-version-"));
  tempDirs.push(dir);

  run("git", ["init"], dir);
  run("git", ["config", "user.name", "Test User"], dir);
  run("git", ["config", "user.email", "test@example.com"], dir);
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "compute-version-fixture", version: "1.2.3" }, null, 2)
  );
  await writeFile(path.join(dir, "README.md"), "# fixture\n");
  run("git", ["add", "."], dir);
  run("git", ["commit", "-m", "init"], dir);

  const headSha = run("git", ["rev-parse", "HEAD"], dir).stdout.trim();
  return { dir, headSha };
}

function run(command: string, args: string[], cwd: string, extraEnv?: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const key of [
    "HOME",
    "PATH",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "TERM",
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  Object.assign(env, extraEnv);
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";

  const finalCommand = command === "git" ? command : command;
  const finalArgs = command === "git" ? ["-c", "core.hooksPath=/dev/null", ...args] : args;

  const result = spawnSync(finalCommand, finalArgs, {
    cwd,
    env,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `status=${result.status}`,
        `stdout=${result.stdout}`,
        `stderr=${result.stderr}`,
      ].join("\n")
    );
  }

  return result;
}

async function runComputeVersion(
  cwd: string,
  env: Record<string, string>
): Promise<Record<string, string>> {
  const outputPath = path.join(cwd, "github-output.txt");
  await writeFile(outputPath, "");

  run("bash", [SCRIPT_PATH], cwd, {
    GITHUB_OUTPUT: outputPath,
    SKIP_FETCH_TAGS: "true",
    ...env,
  });

  const raw = await readFile(outputPath, "utf-8");
  return Object.fromEntries(
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("compute-version.sh", () => {
  test("bumps only the requested component tag lineage", async () => {
    const { dir } = await createTempRepo();
    run("git", ["tag", "frontend-v1.2.3"], dir);
    run("git", ["tag", "backend-v9.9.9"], dir);
    await writeFile(path.join(dir, "CHANGELOG.md"), "release fixture\n");
    run("git", ["add", "CHANGELOG.md"], dir);
    run("git", ["commit", "-m", "second"], dir);
    const headSha = run("git", ["rev-parse", "HEAD"], dir).stdout.trim();

    const outputs = await runComputeVersion(dir, {
      COMPONENT: "frontend",
      BUMP_LEVEL: "patch",
      CHANNEL: "stable",
      COMMIT_SHA: headSha,
    });

    expect(outputs.release_tag).toBe("frontend-v1.2.4");
    expect(outputs.app_version).toBe("1.2.4");
    expect(outputs.is_prerelease).toBe("false");
    expect(outputs.release_major).toBe("1");
  });

  test("creates rc tags with the component prefix and commit sha", async () => {
    const { dir, headSha } = await createTempRepo();
    run("git", ["tag", "backend-v2.4.8"], dir);

    const outputs = await runComputeVersion(dir, {
      COMPONENT: "backend",
      BUMP_LEVEL: "minor",
      CHANNEL: "rc",
      COMMIT_SHA: headSha,
    });

    expect(outputs.release_tag).toBe(`backend-v2.5.0-rc.${headSha.slice(0, 7)}`);
    expect(outputs.app_version).toBe(`2.5.0-rc.${headSha.slice(0, 7)}`);
    expect(outputs.is_prerelease).toBe("true");
    expect(outputs.release_major).toBe("2");
  });

  test("reuses an existing matching head tag instead of bumping again", async () => {
    const { dir, headSha } = await createTempRepo();
    run("git", ["tag", `frontend-v3.1.0-rc.${headSha.slice(0, 7)}`], dir);

    const outputs = await runComputeVersion(dir, {
      COMPONENT: "frontend",
      BUMP_LEVEL: "major",
      CHANNEL: "rc",
      COMMIT_SHA: headSha,
    });

    expect(outputs.release_tag).toBe(`frontend-v3.1.0-rc.${headSha.slice(0, 7)}`);
    expect(outputs.app_version).toBe(`3.1.0-rc.${headSha.slice(0, 7)}`);
    expect(outputs.is_prerelease).toBe("true");
    expect(outputs.release_major).toBe("3");
  });

  test("seeds the first component release from legacy unprefixed tags", async () => {
    const { dir } = await createTempRepo();
    run("git", ["tag", "v1.3.0"], dir);
    await writeFile(path.join(dir, "CHANGELOG.md"), "legacy lineage\n");
    run("git", ["add", "CHANGELOG.md"], dir);
    run("git", ["commit", "-m", "legacy-follow-up"], dir);
    const headSha = run("git", ["rev-parse", "HEAD"], dir).stdout.trim();

    const outputs = await runComputeVersion(dir, {
      COMPONENT: "frontend",
      BUMP_LEVEL: "patch",
      CHANNEL: "stable",
      COMMIT_SHA: headSha,
    });

    expect(outputs.release_tag).toBe("frontend-v1.3.1");
    expect(outputs.app_version).toBe("1.3.1");
    expect(outputs.release_major).toBe("1");
  });
});
