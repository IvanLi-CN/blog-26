import { afterEach, expect, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const helper = resolve("scripts/lib/copy-worktree-snapshot.py");
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function run(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "worktree-snapshot-copy-"));
  roots.push(root);
  const source = join(root, "source");
  const destination = join(root, "destination");
  await mkdir(source);
  await mkdir(destination);
  expect((await run(["git", "init", "-q"], source)).status).toBe(0);
  await writeFile(join(source, ".gitignore"), "ignored.local\n");
  await writeFile(join(source, "tracked.txt"), "tracked bytes\n");
  expect((await run(["git", "add", "."], source)).status).toBe(0);
  return { source, destination };
}
test("batch snapshot keeps the Git file set, bytes, executable modes and cp link behavior", async () => {
  const { source, destination } = await fixture();
  await writeFile(join(source, "ignored.local"), "not a snapshot input");
  await writeFile(join(source, "untracked\tline\n-name"), "untracked bytes");
  await writeFile(join(source, "executable"), "#!/bin/sh\n");
  await chmod(join(source, "executable"), 0o755);
  await chmod(join(source, "tracked.txt"), 0o666);
  await symlink("tracked.txt", join(source, "file-link"));
  const result = await run(
    [
      "bash",
      "-c",
      'umask 027; exec python3 "$1" "$2" "$3"',
      "snapshot",
      helper,
      source,
      destination,
    ],
    source
  );
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  expect(JSON.parse(result.stdout)).toMatchObject({ event: "worktree-snapshot-copy", files: 5 });
  expect(await readFile(join(destination, "tracked.txt"), "utf8")).toBe("tracked bytes\n");
  expect(await readFile(join(destination, "untracked\tline\n-name"), "utf8")).toBe(
    "untracked bytes"
  );
  expect(await readFile(join(destination, "file-link"), "utf8")).toBe("tracked bytes\n");
  expect((await lstat(join(destination, "file-link"))).isFile()).toBe(true);
  expect((await lstat(join(destination, "tracked.txt"))).mode & 0o777).toBe(0o640);
  expect((await lstat(join(destination, "executable"))).mode & 0o777).toBe(0o750);
  expect(await Bun.file(join(destination, "ignored.local")).exists()).toBe(false);
  expect(await lstat(join(destination, ".git")).catch(() => null)).toBeNull();
});
test("snapshot preserves existing modes and fails on a missing tracked source", async () => {
  const { source, destination } = await fixture();
  await writeFile(join(destination, "tracked.txt"), "old");
  await chmod(join(destination, "tracked.txt"), 0o600);
  expect((await run(["python3", helper, source, destination], source)).status).toBe(0);
  expect((await lstat(join(destination, "tracked.txt"))).mode & 0o777).toBe(0o600);
  await rm(join(source, "tracked.txt"));
  expect((await run(["python3", helper, source, destination], source)).status).not.toBe(0);
});
test("snapshot rejects overlapping roots before writing", async () => {
  const { source } = await fixture();
  const result = await run(["python3", helper, source, join(source, "nested")], source);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("must be disjoint");
  expect(await Bun.file(join(source, "nested/tracked.txt")).exists()).toBe(false);
});
