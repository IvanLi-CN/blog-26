import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceAuthoredContent } from "./authored-write";

test("restoring authored content preserves permissions and removes staging files", async () => {
  const root = await mkdtemp(join(tmpdir(), "clipping-authored-write-"));
  try {
    const path = join(root, "memo.md");
    await writeFile(path, "Original remarks", { mode: 0o600 });
    await replaceAuthoredContent(path, "New target\nOriginal remarks");
    expect(await readFile(path, "utf8")).toBe("New target\nOriginal remarks");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readdir(root)).toEqual(["memo.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed replacement leaves the original destination intact and cleans staging", async () => {
  const root = await mkdtemp(join(tmpdir(), "clipping-authored-failure-"));
  try {
    const path = join(root, "memo.md");
    await mkdir(path);
    await writeFile(join(path, "original"), "Author content");
    await expect(replaceAuthoredContent(path, "Replacement")).rejects.toBeDefined();
    expect(await readFile(join(path, "original"), "utf8")).toBe("Author content");
    expect(await readdir(root)).toEqual(["memo.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
