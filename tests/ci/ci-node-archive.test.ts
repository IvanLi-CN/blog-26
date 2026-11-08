import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[] = [];
const helper = resolve("scripts/prepare-ci-node.py");
type Step = { uses?: string; with?: Record<string, string> };
type Workflow = { jobs: Record<string, { steps: Step[] }> };
type CompositeAction = { runs: { steps: Step[] } };

const python = Bun.which("python3") ?? "";
if (!python) throw new Error("Python is required for the CI Node archive tests");
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function execute(args: string[], env = process.env) {
  const child = Bun.spawn(args, { env, stdout: "pipe", stderr: "pipe" });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr };
}
async function fixture(version = "22.23.2") {
  const root = await mkdtemp(join(tmpdir(), "ci-node-archive-"));
  roots.push(root);
  await mkdir(join(root, "node/bin"), { recursive: true });
  await writeFile(join(root, "node/bin/node"), `#!/bin/sh\nprintf 'v${version}\\n'\n`, {
    mode: 0o755,
  });
  await writeFile(join(root, "node/required-resource"), "complete archive resource");
  const source = join(root, "source.tar.xz");
  expect((await execute(["tar", "-cJf", source, "-C", root, "node"])).status).toBe(0);
  const hash = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(source).arrayBuffer())
    .digest("hex");
  const bin = join(root, "commands");
  await mkdir(bin);
  await writeFile(
    join(bin, "curl"),
    '#!/bin/sh\nprintf "download\\n" >> "$CALL_LOG"\nexec /bin/cp "$DOWNLOAD_FIXTURE" "$4"\n',
    { mode: 0o755 }
  );
  for (const tool of ["tar", "xz"]) {
    const path = Bun.which(tool);
    if (path) await symlink(path, join(bin, tool));
  }
  const archive = join(root, "cached.tar.xz");
  const cache = join(root, "tools");
  const callLog = join(root, "calls");
  const run = (expected = hash) =>
    execute(
      [
        python,
        "-c",
        'import importlib.util,sys; from pathlib import Path; s=importlib.util.spec_from_file_location("ci_node",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.prepare(Path(sys.argv[2]),Path(sys.argv[3]),"22.23.2",sys.argv[4],"https://nodejs.org/fixture")',
        helper,
        archive,
        cache,
        expected,
      ],
      { ...process.env, PATH: bin, DOWNLOAD_FIXTURE: source, CALL_LOG: callLog }
    );
  return { root, source, archive, cache, callLog, hash, run };
}

test("verified cached Node archive installs a complete tool cache without downloading", async () => {
  const f = await fixture();
  await writeFile(f.archive, await readFile(f.source));
  expect((await f.run()).status).toBe(0);
  expect(await Bun.file(f.callLog).exists()).toBe(false);
  expect(await Bun.file(join(f.cache, "node/22.23.2/x64.complete")).exists()).toBe(true);
  expect(await Bun.file(join(f.cache, "node/22.23.2/x64/required-resource")).text()).toBe(
    "complete archive resource"
  );
  await writeFile(f.archive, "unused corrupt archive");
  expect((await f.run()).status).toBe(0);
  expect(await Bun.file(f.callLog).exists()).toBe(false);
});

test("missing or corrupt archive is downloaded and verified; restored links are never followed", async () => {
  const f = await fixture();
  const unrelated = join(f.root, "unrelated");
  await writeFile(unrelated, "preserve me");
  await symlink(unrelated, f.archive);
  expect((await f.run()).status).toBe(0);
  expect(await Bun.file(f.callLog).text()).toBe("download\n");
  expect(await Bun.file(unrelated).text()).toBe("preserve me");
  expect(
    new Bun.CryptoHasher("sha256").update(await Bun.file(f.archive).arrayBuffer()).digest("hex")
  ).toBe(f.hash);
});

test("checksum or version failures never publish a usable Node tool cache", async () => {
  const corrupt = await fixture();
  expect((await corrupt.run("0".repeat(64))).status).not.toBe(0);
  expect(await Bun.file(join(corrupt.cache, "node/22.23.2/x64.complete")).exists()).toBe(false);
  const wrong = await fixture("22.0.0");
  expect((await wrong.run()).status).not.toBe(0);
  expect(await Bun.file(join(wrong.cache, "node/22.23.2/x64.complete")).exists()).toBe(false);
  await mkdir(join(corrupt.cache, "node/22.23.2/x64"), { recursive: true });
  expect((await corrupt.run()).stderr).toContain("Refusing to overwrite");
});

test("only normal CI producers use the pinned archive recipe; frozen release inputs stay unchanged", async () => {
  const action = Bun.YAML.parse(
    await Bun.file(".github/actions/setup-ci-node/action.yml").text()
  ) as CompositeAction;
  const code = await Bun.file(helper).text();
  const sha = code.match(/SHA256 = "([a-f0-9]{64})"/)?.[1];
  expect(sha).toBeTruthy();
  const cache = action.runs.steps.find((step: Step) => step.uses === "actions/cache@v6");
  expect(cache?.with?.key).toContain(`linux-x64-22.23.2-${sha}`);
  expect(cache?.with?.["restore-keys"]).toBeUndefined();
  expect(cache?.with?.path).toBe("${{ runner.temp }}/ci-node-22.23.2-linux-x64.tar.xz");
  expect(action.runs.steps.at(-1)).toMatchObject({
    uses: "actions/setup-node@v7",
    with: { "node-version": "22.23.2" },
  });
  const ci = Bun.YAML.parse(await Bun.file(".github/workflows/ci.yml").text()) as Workflow;
  const e2e = Bun.YAML.parse(await Bun.file(".github/workflows/e2e.yml").text()) as Workflow;
  for (const job of [ci.jobs.build, ci.jobs.docker, e2e.jobs.e2e, e2e.jobs["web-demo"]]) {
    expect(job.steps.some((step: Step) => step.uses === "./.github/actions/setup-ci-node")).toBe(
      true
    );
  }
  expect(
    ci.jobs["frozen-product-smoke"].steps.some(
      (step: Step) =>
        step.uses === "actions/setup-node@v7" && step.with?.["node-version"] === "22.23.2"
    )
  ).toBe(true);
  expect(await Bun.file(".github/workflows/product-release.yml").text()).not.toContain(
    "./.github/actions/setup-ci-node"
  );
});
