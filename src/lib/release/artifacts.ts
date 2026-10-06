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
