import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Deployment safety budget, not the provider's advertised storage quota.
// A 2.35 GB artifact exhausted the provider's /dev/shm copy stage, yet the
// provider reported the partially copied deployment as successful.
export const PUBLIC_ARTIFACT_BYTE_BUDGET = 1024 * 1024 * 1024;

export async function verifyPublicArtifactBudget(
  root: string,
  byteBudget = PUBLIC_ARTIFACT_BYTE_BUDGET
) {
  let bytes = 0;
  let files = 0;
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        bytes += (await stat(path)).size;
        files++;
        if (bytes > byteBudget)
          throw new Error(
            `Public artifact exceeds the ${byteBudget}-byte deployment safety budget`
          );
      } else throw new Error("Public artifact contains a link or special file");
    }
  }
  await visit(root);
  for (const name of ["index.html", "404.html", "version.json", "edgeone.json"])
    if ((await stat(join(root, name))).size === 0)
      throw new Error(`Public artifact has an empty critical file: ${name}`);
  return { bytes, files };
}
