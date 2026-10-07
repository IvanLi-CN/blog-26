import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { GitHubRelease } from "./github";
import type { ReleaseEntry } from "./ledger";
import { canonicalJson, digest, digestSchema, shaSchema, versionSchema } from "./policy";

export const artifactManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(["inputs", "products"]),
    identity: digestSchema,
    productVersion: versionSchema,
    sourceSha: shaSchema,
    files: z.record(z.string(), digestSchema),
  })
  .strict();
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
export function bytesDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export async function fileDigest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function directoryFiles(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(relative: string) {
    for (const name of (await readdir(join(root, relative))).sort()) {
      const path = relative ? `${relative}/${name}` : name;
      if (path === "artifact-manifest.json") continue;
      const info = await lstat(join(root, path));
      if (info.isSymbolicLink())
        throw new Error("Frozen inputs/products cannot contain symbolic links");
      if (info.isDirectory()) await walk(path);
      else if (info.isFile()) files[path] = await fileDigest(join(root, path));
      else throw new Error("Frozen inputs/products contain a special file");
    }
  }
  await walk("");
  return files;
}

export async function sealDirectory(
  root: string,
  entry: ReleaseEntry,
  kind: ArtifactManifest["kind"]
): Promise<ArtifactManifest> {
  const manifest = artifactManifestSchema.parse({
    schemaVersion: 1,
    kind,
    identity: entry.id,
    productVersion: entry.version,
    sourceSha: entry.mergeSha,
    files: await directoryFiles(root),
  });
  await writeFile(join(root, "artifact-manifest.json"), `${canonicalJson(manifest)}\n`);
  return manifest;
}

export async function verifyDirectory(
  root: string,
  entry: ReleaseEntry,
  kind: ArtifactManifest["kind"],
  expectedDigest?: string
): Promise<ArtifactManifest> {
  const manifest = artifactManifestSchema.parse(
    JSON.parse(await readFile(join(root, "artifact-manifest.json"), "utf8"))
  );
  if (
    manifest.kind !== kind ||
    manifest.identity !== entry.id ||
    manifest.productVersion !== entry.version ||
    manifest.sourceSha !== entry.mergeSha ||
    (expectedDigest && digest(manifest) !== expectedDigest)
  )
    throw new Error("Frozen artifact provenance/digest conflicts with its original identity");
  for (const path of Object.keys(manifest.files)) {
    if (
      path.startsWith("/") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      path.includes("\\")
    )
      throw new Error("Frozen artifact contains an unsafe path");
  }
  if (canonicalJson(await directoryFiles(root)) !== canonicalJson(manifest.files))
    throw new Error("Frozen artifact bytes changed or files are missing");
  return manifest;
}

const serverArtifactSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  expired: z.boolean(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  workflow_run: z.object({ id: z.number().int().positive() }),
});

export function assertNeverFrozen(
  github: GitHubRelease,
  entry: ReleaseEntry,
  kind: ArtifactManifest["kind"]
): void {
  const run = z
    .object({
      id: z.number().int().positive(),
      run_attempt: z.number().int().positive(),
      event: z.literal("workflow_run"),
      path: z.literal(".github/workflows/product-release.yml"),
      head_branch: z.literal("main"),
      head_repository: z.object({ full_name: z.literal(github.contract.repository) }),
    })
    .parse(github.api(`${github.root}/actions/runs/${entry.releaseRunId}`));
  if (run.id !== entry.releaseRunId) throw new Error("Original release run identity changed");
  const completedFreezeSteps =
    kind === "inputs"
      ? ["Freeze public build inputs under the production lock", "Retain frozen inputs for 90 days"]
      : [
          "Build the static frontend and full-feature image",
          "Retain both immutable products for 90 days",
        ];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    const jobs = github.pages(
      `${github.root}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`,
      "jobs"
    );
    const production = jobs
      .map((raw) =>
        z
          .object({
            name: z.string(),
            status: z.string(),
            steps: z.array(
              z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() })
            ),
          })
          .parse(raw)
      )
      .filter((job) => job.name === "production");
    if (
      production.length !== 1 ||
      (attempt < run.run_attempt && production[0]?.status !== "completed")
    )
      throw new Error("Original freeze history is unavailable; recovery is blocked");
    for (const step of production[0]?.steps ?? []) {
      if (!completedFreezeSteps.includes(step.name) || step.conclusion === "skipped") continue;
      if (step.status === "completed" && step.conclusion === "success")
        throw new Error("Unbound frozen artifact was lost; recovery is blocked");
      // These steps only create bytes in the ephemeral runner workspace. If they fail,
      // no immutable artifact can exist until the following upload step succeeds.
      if (
        step.status === "completed" &&
        [
          "Freeze public build inputs under the production lock",
          "Build the static frontend and full-feature image",
        ].includes(step.name) &&
        ["failure", "cancelled"].includes(step.conclusion || "")
      )
        continue;
      // A failed/cancelled process can have sealed bytes before exit; absence is unproven.
      if (!["pending", "queued"].includes(step.status))
        throw new Error("Original freeze outcome is unavailable; recovery is blocked");
    }
  }
}

export function findArtifact(
  github: GitHubRelease,
  entry: ReleaseEntry,
  kind: ArtifactManifest["kind"]
) {
  if (!entry.releaseRunId) throw new Error("Original release run is missing");
  const name = `release-${entry.id}-${kind}`;
  const artifacts = github
    .pages(`${github.root}/actions/runs/${entry.releaseRunId}/artifacts?per_page=100`, "artifacts")
    .map((raw) => serverArtifactSchema.parse(raw))
    .filter((item) => item.name === name);
  if (artifacts.length > 1) throw new Error("Multiple immutable artifacts claim the same identity");
  const artifact = artifacts[0];
  const recorded = entry[kind];
  if (!artifact) {
    if (recorded) throw new Error("Frozen artifact was removed; recovery is blocked");
    // An upload may succeed before the ledger bind. Its native run history survives artifact loss.
    assertNeverFrozen(github, entry, kind);
    return undefined;
  }
  if (artifact.expired) throw new Error("Frozen artifact expired; recovery is blocked");
  if (
    artifact.workflow_run.id !== entry.releaseRunId ||
    (recorded &&
      (artifact.id !== recorded.artifactId ||
        name !== recorded.artifactName ||
        artifact.digest !== recorded.archiveDigest))
  )
    throw new Error("Server artifact provenance changed");
  return artifact;
}

export async function restoreArtifact(
  github: GitHubRelease,
  entry: ReleaseEntry,
  kind: ArtifactManifest["kind"],
  root: string
) {
  const artifact = findArtifact(github, entry, kind);
  if (!artifact) return undefined;
  await mkdir(resolve(root), { recursive: true });
  github.transport.command([
    "run",
    "download",
    String(entry.releaseRunId),
    "--repo",
    github.contract.repository,
    "--name",
    artifact.name,
    "--dir",
    resolve(root),
  ]);
  const manifest = await verifyDirectory(root, entry, kind, entry[kind]?.manifestDigest);
  return {
    runId: entry.releaseRunId as number,
    artifactId: artifact.id,
    artifactName: artifact.name,
    archiveDigest: artifact.digest,
    manifestDigest: digest(manifest),
  };
}
