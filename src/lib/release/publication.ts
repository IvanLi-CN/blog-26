import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { bytesDigest, fileDigest } from "./artifacts";
import { publicVersionSchema } from "./deployment";
import type { GitHubRelease } from "./github";
import {
  changeLedger,
  type LedgerStore,
  newerDeploymentExists,
  type ProductionPointers,
  productionPointersSchema,
  type ReleaseEntry,
  type ReleaseLedger,
  updateRelease,
} from "./ledger";
import { canonicalJson, compareVersions } from "./policy";
import { type ProductManifest, verifyProducts } from "./products";
import { imageVersionTag, isPrerelease, releaseTag } from "./version";

export interface PublicationPorts {
  publish(entry: ReleaseEntry): Promise<NonNullable<ReleaseEntry["publication"]>>;
  deploy(entry: ReleaseEntry): Promise<NonNullable<ReleaseEntry["deployment"]>>;
  promote(entry: ReleaseEntry): Promise<void>;
  productionPointers?(): Promise<ProductionPointers>;
}

export async function finishRelease(
  store: LedgerStore,
  identity: string,
  ports: PublicationPorts
): Promise<ReleaseEntry> {
  async function current() {
    const { ledger } = await store.read();
    const entry = ledger.entries.find((item) => item.id === identity);
    if (!entry) throw new Error("Release identity is missing");
    if (
      !isPrerelease(entry.version) &&
      entry.stage !== "complete" &&
      newerDeploymentExists(ledger, entry)
    )
      throw new Error(
        "A newer product already owns production; recovery must not move its pointers backwards"
      );
    return entry;
  }
  async function record(patch: Partial<ReleaseEntry>) {
    await changeLedger(store, (ledger) => ({
      ledger: updateRelease(ledger, identity, patch),
      result: null,
    }));
  }
  let entry = await current();
  if (entry.stage === "complete") return entry;
  if (!["frozen", "published", "deployed"].includes(entry.stage))
    throw new Error("Publication requires both frozen products");
  async function pointers(): Promise<ProductionPointers> {
    if (!ports.productionPointers)
      throw new Error("Prerelease isolation observations are required");
    return productionPointersSchema.parse(await ports.productionPointers());
  }
  if (isPrerelease(entry.version)) {
    const observed = await pointers();
    if (entry.productionBefore && canonicalJson(observed) !== canonicalJson(entry.productionBefore))
      throw new Error("Production pointers changed; prerelease isolation cannot be proven");
    if (!entry.productionBefore) {
      await record({ productionBefore: observed });
      entry = await current();
    }
  }
  if (entry.stage === "frozen") {
    const publication = await ports.publish(entry);
    await record({ publication, stage: "published" });
    entry = await current();
  }
  if (entry.stage === "published") {
    if (isPrerelease(entry.version)) {
      await record({
        productionAfter: await pointers(),
        deploymentStatus: "not-applicable",
        latestStatus: "not-applicable",
        stage: "complete",
      });
      return current();
    }
    const deployment = await ports.deploy(entry);
    await record({ deployment, stage: "deployed" });
    entry = await current();
  }
  if (entry.stage === "deployed") {
    await ports.promote(entry);
    await record({ latestVerified: true, stage: "complete" });
    entry = await current();
  }
  if (entry.stage !== "complete") throw new Error("Publication requires both frozen products");
  return entry;
}

export async function readProductionPointers(github: GitHubRelease): Promise<ProductionPointers> {
  const raw = github.optional(`${github.root}/releases/latest`);
  const latest =
    raw === undefined
      ? null
      : z.object({ id: z.number().int().positive(), tag_name: z.string() }).parse(raw);
  const site = new URL(process.env.PUBLIC_SITE_URL || "https://ivanli.cc/");
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash)
    throw new Error("Production observation URL is invalid");
  const options = {
    redirect: "error" as const,
    cache: "no-store" as const,
    signal: AbortSignal.timeout(30_000),
  };
  const versionResponse = await fetch(new URL("version.json", site), options);
  if (!versionResponse.ok && versionResponse.status !== 404)
    throw new Error("Production version observation failed");
  const pointerResponse = await fetch(new URL("_content/playbook/manifest.json", site), options);
  if (!pointerResponse.ok) throw new Error("Production Playbook pointer observation failed");
  const playbookPointer = z
    .object({ editionDigest: z.string(), rendererCommit: z.string() })
    .parse(await pointerResponse.json());
  if (
    versionResponse.status === 404 &&
    playbookPointer.rendererCommit !== github.contract.bootstrap.sourceSha
  )
    throw new Error("Absent version endpoint cannot identify an unknown production renderer");
  return productionPointersSchema.parse({
    githubLatest: latest && { id: latest.id, tag: latest.tag_name },
    imageLatest: registryDigest(`${github.contract.products.image.repository}:latest`) ?? null,
    siteVersion: versionResponse.ok
      ? publicVersionSchema.parse(await versionResponse.json())
      : null,
    playbookPointer,
  });
}

const releaseSchema = z.object({
  id: z.number().int().positive(),
  tag_name: z.string(),
  target_commitish: z.string(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  author: z.object({ login: z.string() }),
});
const assetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  state: z.literal("uploaded"),
  digest: z.string().nullable(),
});

export function registryDigest(image: string): string | undefined {
  try {
    const raw = execFileSync(
      "skopeo",
      ["inspect", "--raw", "--authfile", registryAuth(), `docker://${image}`],
      { maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
    );
    return `sha256:${bytesDigest(raw)}`;
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    if (/MANIFEST_UNKNOWN|manifest unknown|name unknown/.test(stderr)) return undefined;
    throw new Error("Registry inspection failed; absent image cannot be assumed");
  }
}
export async function assertProductionOwner(
  github: GitHubRelease,
  ledger: ReleaseLedger,
  entry: ReleaseEntry
): Promise<void> {
  const known = [
    { version: ledger.bootstrap.version, sha: ledger.bootstrap.sourceSha },
    ...ledger.entries
      .filter((item) => ["published", "deployed", "complete"].includes(item.stage))
      .map((item) => ({ version: item.version, sha: item.mergeSha })),
  ];
  function accept(version: string, sha: string) {
    if (
      compareVersions(version, entry.version) > 0 ||
      !known.some((item) => item.version === version && item.sha === sha)
    )
      throw new Error("Production pointer belongs to a newer or unknown source; do not replace it");
  }
  const image = `${github.contract.products.image.repository}:latest`;
  if (registryDigest(image)) {
    let labels: Record<string, string>;
    try {
      labels = z
        .record(z.string(), z.string())
        .parse(
          JSON.parse(
            execFileSync(
              "skopeo",
              [
                "inspect",
                "--authfile",
                registryAuth(),
                "--format",
                "{{json .Labels}}",
                `docker://${image}`,
              ],
              { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
            )
          )
        );
    } catch {
      throw new Error("Production image ownership cannot be verified");
    }
    accept(
      labels["org.opencontainers.image.version"] || "",
      labels["org.opencontainers.image.revision"] || ""
    );
  }
  const site = new URL(process.env.PUBLIC_SITE_URL || "https://ivanli.cc/");
  const response = await fetch(new URL("version.json", site), {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.ok) {
    const metadata = publicVersionSchema.parse(await response.json());
    accept(metadata.productVersion, metadata.sourceSha);
  } else if (response.status === 404) {
    const pointer = await fetch(new URL("_content/playbook/manifest.json", site), {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (
      !pointer.ok ||
      z.object({ rendererCommit: z.string() }).parse(await pointer.json()).rendererCommit !==
        ledger.bootstrap.sourceSha
    )
      throw new Error("Unversioned static deployment is not the approved bootstrap renderer");
  } else throw new Error("Production ownership verification failed");
}

function registryAuth(): string {
  return join(process.env.DOCKER_CONFIG || join(process.env.HOME || "", ".docker"), "config.json");
}
export function copyImage(source: string, target: string): void {
  try {
    execFileSync(
      "skopeo",
      ["copy", "--all", "--preserve-digests", "--authfile", registryAuth(), source, target],
      { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1024 * 1024 }
    );
  } catch {
    throw new Error("Registry copy failed; retain frozen products for recovery");
  }
}

export async function publishProducts(
  github: GitHubRelease,
  entry: ReleaseEntry,
  root: string
): Promise<NonNullable<ReleaseEntry["publication"]>> {
  const manifest = await verifyProducts(entry, root);
  const tag = releaseTag(entry.version);
  const prerelease = isPrerelease(entry.version);
  const existingTag = github.canonicalTags().find((item) => item.version === entry.version);
  if (existingTag && existingTag.sha !== entry.mergeSha)
    throw new Error("Unified tag belongs to a different source");
  if (!existingTag)
    github.api(`${github.root}/git/refs`, "POST", { ref: `refs/tags/${tag}`, sha: entry.mergeSha });
  const marker = `Release-Identity: ${entry.id}\nSource-SHA: ${entry.mergeSha}\nProducts-Manifest: ${entry.products?.manifestDigest}`;
  let release = releaseSchema.parse(
    github.optional(`${github.root}/releases/tags/${tag}`) ||
      github.api(`${github.root}/releases`, "POST", {
        tag_name: tag,
        target_commitish: entry.mergeSha,
        name: tag,
        body: `Static frontend and full-feature Docker image.\n\n${marker}`,
        draft: true,
        prerelease,
        make_latest: "false",
      })
  );
  if (
    release.tag_name !== tag ||
    release.target_commitish !== entry.mergeSha ||
    !release.body?.includes(marker) ||
    release.prerelease !== prerelease ||
    release.author.login !== `${github.botSlug}[bot]`
  )
    throw new Error("Release belongs to a different identity");
  async function asset(name: string, expected: string) {
    let assets = github
      .pages(`${github.root}/releases/${release.id}/assets?per_page=100`)
      .map((raw) => assetSchema.parse(raw))
      .filter((item) => item.name === name);
    if (assets.length > 1) throw new Error("Duplicate release assets claim the same name");
    if (!assets[0]) {
      if (!release.draft)
        throw new Error("An already-published release is missing an immutable asset");
      github.transport.command([
        "release",
        "upload",
        tag,
        join(root, name),
        "--repo",
        github.contract.repository,
      ]);
      assets = github
        .pages(`${github.root}/releases/${release.id}/assets?per_page=100`)
        .map((raw) => assetSchema.parse(raw))
        .filter((item) => item.name === name);
    }
    const uploaded = assets[0];
    if (!uploaded || (uploaded.digest && uploaded.digest !== `sha256:${expected}`))
      throw new Error("Release asset digest conflicts with the frozen product");
    if (!uploaded.digest) {
      const directory = await mkdtemp(join(tmpdir(), "blog26-asset-"));
      github.transport.command([
        "release",
        "download",
        tag,
        "--repo",
        github.contract.repository,
        "--pattern",
        name,
        "--dir",
        directory,
      ]);
      if ((await fileDigest(join(directory, name))) !== expected)
        throw new Error("Existing release asset bytes conflict");
    }
    return uploaded.id;
  }
  const staticAssetId = await asset("frontend.tar.gz", manifest.staticSha256);
  const manifestAssetId = await asset(
    "release-manifest.json",
    bytesDigest(await readFile(join(root, "release-manifest.json")))
  );
  const image = `${github.contract.products.image.repository}:${imageVersionTag(entry.version)}`;
  const previous = registryDigest(image);
  if (previous && previous !== manifest.imageDigest)
    throw new Error("Version image already has different immutable bytes");
  if (!previous) copyImage(`oci-archive:${join(root, "image.oci.tar")}`, `docker://${image}`);
  if (registryDigest(image) !== manifest.imageDigest)
    throw new Error("Uploaded image digest differs from the frozen OCI product");
  if (release.draft)
    release = releaseSchema.parse(
      github.api(`${github.root}/releases/${release.id}`, "PATCH", {
        draft: false,
        make_latest: "false",
      })
    );
  if (release.draft) throw new Error("Unified release publication was not confirmed");
  return {
    releaseId: release.id,
    staticAssetId,
    manifestAssetId,
    imageDigest: manifest.imageDigest,
  };
}

export async function promoteLatest(github: GitHubRelease, entry: ReleaseEntry): Promise<void> {
  if (isPrerelease(entry.version)) throw new Error("Prerelease cannot promote formal latest");
  if (!entry.publication || !entry.products)
    throw new Error("Both publication proofs are required before promotion");
  const image = github.contract.products.image.repository;
  const immutable = `${image}:${imageVersionTag(entry.version)}`;
  if (registryDigest(immutable) !== entry.products.imageDigest)
    throw new Error("Immutable version image changed before latest promotion");
  if (registryDigest(`${image}:latest`) !== entry.products.imageDigest)
    copyImage(`docker://${immutable}`, `docker://${image}:latest`);
  if (registryDigest(`${image}:latest`) !== entry.products.imageDigest)
    throw new Error("Latest image promotion was not confirmed");
  github.api(`${github.root}/releases/${entry.publication.releaseId}`, "PATCH", {
    make_latest: "true",
  });
  const latest = releaseSchema.parse(github.api(`${github.root}/releases/latest`));
  if (latest.id !== entry.publication.releaseId || latest.tag_name !== `v${entry.version}`)
    throw new Error("Latest GitHub Release was not confirmed");
}

export function productProof(manifest: ProductManifest) {
  return {
    staticSha256: manifest.staticSha256,
    imageSha256: manifest.imageSha256,
    imageDigest: manifest.imageDigest,
  };
}
