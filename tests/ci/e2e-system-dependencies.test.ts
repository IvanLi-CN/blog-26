import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflow = Bun.YAML.parse(await Bun.file(".github/workflows/e2e.yml").text()) as {
  jobs: { e2e: { steps: { name: string; run?: string }[] } };
};
const command =
  workflow.jobs.e2e.steps.find((step) => step.name === "Install system dependencies")?.run ?? "";
if (!command) throw new Error("Missing E2E system dependency step");

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function run(installed: boolean, failure = "") {
  const root = await mkdtemp(join(tmpdir(), "e2e-system-dependencies-"));
  roots.push(root);
  if (installed) await writeFile(join(root, "lsof"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(
    join(root, "sudo"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\ncase "$*" in *"$FAIL_AT"*) [ -z "$FAIL_AT" ] || exit 42;; esac\n',
    { mode: 0o755 }
  );
  // An isolated PATH prevents real package management or a host lsof from running.
  const child = Bun.spawn(["/bin/bash", "-e", "-c", command], {
    env: { ...process.env, PATH: root, CALL_LOG: join(root, "calls"), FAIL_AT: failure },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  const calls = await Bun.file(join(root, "calls"))
    .text()
    .catch(() => "");
  return { status, stderr, calls };
}

test("E2E initialization does not run apt when lsof is already installed", async () => {
  expect(await run(true)).toEqual({ status: 0, stderr: "", calls: "" });
});

test("E2E initialization retains update and installation on a minimal runner", async () => {
  expect(await run(false)).toEqual({
    status: 0,
    stderr: "",
    calls: "apt-get update\napt-get install -y lsof\n",
  });
});

test("E2E initialization fails closed on update or installation errors", async () => {
  const update = await run(false, "update");
  expect(update.status).toBe(42);
  expect(update.calls).toBe("apt-get update\n");
  const install = await run(false, "install");
  expect(install.status).toBe(42);
  expect(install.calls).toBe("apt-get update\napt-get install -y lsof\n");
});
