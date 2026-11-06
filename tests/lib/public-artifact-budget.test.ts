import { expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPublicArtifactBudget } from "../../src/lib/release/artifact-budget";

test("rejects oversized, empty and linked deployment artifacts before upload", async () => {
  const root = await mkdtemp(join(tmpdir(), "public-artifact-budget-"));
  try {
    for (const name of ["index.html", "404.html", "version.json", "edgeone.json"])
      await writeFile(join(root, name), "fixture");
    expect(await verifyPublicArtifactBudget(root, 28)).toEqual({ bytes: 28, files: 4 });
    await expect(verifyPublicArtifactBudget(root, 27)).rejects.toThrow("safety budget");
    await writeFile(join(root, "index.html"), "");
    await expect(verifyPublicArtifactBudget(root)).rejects.toThrow("empty critical file");
    await writeFile(join(root, "index.html"), "fixture");
    await symlink(join(root, "index.html"), join(root, "linked.html"));
    await expect(verifyPublicArtifactBudget(root)).rejects.toThrow("link or special file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
