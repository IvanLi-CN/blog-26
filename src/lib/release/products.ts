import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { fileDigest, sealDirectory, verifyDirectory } from "./artifacts";
import { buildCommand, packageFrozenMedia, restoreInputs } from "./inputs";
import type { ReleaseEntry } from "./ledger";
import { canonicalJson, digestSchema, shaSchema, versionSchema } from "./policy";

export const productManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: digestSchema,
    productVersion: versionSchema,
    sourceSha: shaSchema,
    staticSha256: digestSchema,
    imageSha256: digestSchema,
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    staticBuildVersion: z.string().min(1),
    imageBuildVersion: z.string().min(1),
    playbookEdition: digestSchema,
  })
  .strict();
export type ProductManifest = z.infer<typeof productManifestSchema>;

export const staticPreflightSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: digestSchema,
    productVersion: versionSchema,
    sourceSha: shaSchema,
    inputsManifestDigest: digestSchema,
    staticBuildVersion: z.string().min(1),
    staticSha256: digestSchema,
    archiveName: z.literal("frontend.tar.gz"),
  })
  .strict();
export type StaticPreflight = z.infer<typeof staticPreflightSchema>;

function buildEnvironment(
  entry: ReleaseEntry,
  config: Awaited<ReturnType<typeof restoreInputs>>,
  buildVersion: string,
  inputs: string
) {
  return {
    ...config.env,
    PRODUCT_VERSION: entry.version,
    RELEASE_BUILD: "true",
    BUILD_DATE: config.buildDate,
    BUILD_VERSION: buildVersion,
    COMMIT_HASH: config.sourceSha,
    COMMIT_SHORT_HASH: config.sourceSha.slice(0, 8),
    REPOSITORY_URL: "https://github.com/IvanLi-CN/blog-26",
    BRANCH_NAME: "main",
    PUBLIC_CONTENT_BUNDLE_URL: "preloaded",
    PLAYBOOK_FROZEN_INPUT_DIR: resolve(inputs),
    PLAYBOOK_REQUIRED: "true",
    PLAYBOOK_USE_DEPLOYED: "false",
    PLAYBOOK_RENDERER_COMMIT: config.sourceSha,
    NODE_ENV: "production",
    PUBLIC_STATIC_MEDIA_ORIGIN: config.env.PUBLIC_API_BASE_URL,
  };
}

async function buildStaticProduct(
  entry: ReleaseEntry,
  inputs: string,
  archiveRoot: string
): Promise<{
  config: Awaited<ReturnType<typeof restoreInputs>>;
  staticBuildVersion: string;
  staticSha256: string;
}> {
  const config = await restoreInputs(entry, inputs);
  const staticBuildVersion = `${config.buildDate.slice(0, 10).replaceAll("-", "")}-${config.sourceSha.slice(0, 8)}-static`;
  const env = buildEnvironment(entry, config, staticBuildVersion, inputs);
  await mkdir(archiveRoot, { recursive: true });
  await buildCommand(["bun", "run", "search:native:build"], env);
  await buildCommand(["bun", "scripts/generate-version.ts"], env);
  await buildCommand(["bun", "run", "build:compiled"], env);
  for (const command of ["scripts/verify-playbook-artifact.ts", "scripts/verify-pages-build.ts"])
    await buildCommand(["bun", command], env);
  await packageFrozenMedia(inputs, config);
  await buildCommand(["bun", "scripts/verify-public-media-package.ts"], env);
  await rm("edgeone-dist", { recursive: true, force: true });
  await cp("site-dist", "edgeone-dist", { recursive: true });
  await cp("edge-functions", "edgeone-dist/edge-functions", { recursive: true });
  await buildCommand(["bun", "scripts/prepare-edgeone-pwa-config.ts"], env);
  await buildCommand(["bun", "scripts/verify-edgeone-pwa-artifact.ts"], {
    ...env,
    PUBLIC_EDGEONE_ARTIFACT_DIR: "./edgeone-dist",
  });
  const version = z
    .object({ productVersion: versionSchema, sourceSha: shaSchema, buildVersion: z.string() })
    .parse(JSON.parse(await readFile("edgeone-dist/version.json", "utf8")));
  if (
    version.productVersion !== entry.version ||
    version.sourceSha !== entry.mergeSha ||
    version.buildVersion !== staticBuildVersion
  )
    throw new Error("Static version endpoint differs from release identity");
  const archive = join(archiveRoot, "frontend.tar.gz");
  execFileSync("tar", ["-czf", resolve(archive), "-C", "edgeone-dist", "."], {
    stdio: "inherit",
  });
  return { config, staticBuildVersion, staticSha256: await fileDigest(archive) };
}

export async function preflightFrozenMedia(
  entry: ReleaseEntry,
  inputs: string,
  root: string
): Promise<void> {
  if (!entry.inputs)
    throw new Error("Frozen input ledger proof is required before media preflight");
  await rm(root, { recursive: true, force: true });
  const built = await buildStaticProduct(entry, inputs, root);
  const manifest = staticPreflightSchema.parse({
    schemaVersion: 1,
    identity: entry.id,
    productVersion: entry.version,
    sourceSha: entry.mergeSha,
    inputsManifestDigest: entry.inputs.manifestDigest,
    staticBuildVersion: built.staticBuildVersion,
    staticSha256: built.staticSha256,
    archiveName: "frontend.tar.gz",
  });
  await writeFile(join(root, "static-preflight.json"), `${canonicalJson(manifest)}\n`);
}

export async function readFrozenMediaPreflight(
  entry: ReleaseEntry,
  root: string
): Promise<StaticPreflight> {
  if (!entry.inputs) throw new Error("Frozen input ledger proof is required before media reuse");
  const manifest = staticPreflightSchema.parse(
    JSON.parse(await readFile(join(root, "static-preflight.json"), "utf8"))
  );
  const archive = join(root, manifest.archiveName);
  if (
    manifest.identity !== entry.id ||
    manifest.productVersion !== entry.version ||
    manifest.sourceSha !== entry.mergeSha ||
    manifest.inputsManifestDigest !== entry.inputs.manifestDigest ||
    (await fileDigest(archive)) !== manifest.staticSha256
  )
    throw new Error("Frozen static preflight output does not match the release identity");
  return manifest;
}

export async function verifyProducts(entry: ReleaseEntry, root: string): Promise<ProductManifest> {
  await verifyDirectory(root, entry, "products", entry.products?.manifestDigest);
  const manifest = productManifestSchema.parse(
    JSON.parse(await readFile(join(root, "release-manifest.json"), "utf8"))
  );
  if (
    manifest.identity !== entry.id ||
    manifest.productVersion !== entry.version ||
    manifest.sourceSha !== entry.mergeSha ||
    (await fileDigest(join(root, "frontend.tar.gz"))) !== manifest.staticSha256 ||
    (await fileDigest(join(root, "image.oci.tar"))) !== manifest.imageSha256 ||
    manifest.staticBuildVersion === manifest.imageBuildVersion
  )
    throw new Error("Frozen product identity or bytes do not match");
  if (
    entry.products &&
    (manifest.staticSha256 !== entry.products.staticSha256 ||
      manifest.imageSha256 !== entry.products.imageSha256 ||
      manifest.imageDigest !== entry.products.imageDigest)
  )
    throw new Error("Frozen products cannot be replaced");
  return manifest;
}

export async function buildProducts(
  entry: ReleaseEntry,
  inputs: string,
  root: string,
  preflightRoot: string
): Promise<void> {
  const config = await restoreInputs(entry, inputs);
  const preflight = await readFrozenMediaPreflight(entry, preflightRoot);
  const staticBuildVersion = preflight.staticBuildVersion;
  await mkdir(root, { recursive: true });
  await cp(join(preflightRoot, preflight.archiveName), join(root, preflight.archiveName));
  const imageBuildVersion = staticBuildVersion.replace(/-static$/, "-image");
  const env = buildEnvironment(entry, config, staticBuildVersion, inputs);
  await mkdir(root, { recursive: true });
  // Package the already-validated outputs; only runtime metadata has its own build identity.
  await buildCommand(["bun", "scripts/generate-version.ts"], {
    ...env,
    BUILD_VERSION: imageBuildVersion,
  });
  await buildCommand(["bun", "run", "backend:dist"], env);
  const metadata = resolve(root, "image-build.json");
  await buildCommand(
    [
      "docker",
      "buildx",
      "build",
      "--platform",
      "linux/amd64",
      "--target",
      "app-image-prebuilt",
      "--provenance=false",
      "--build-arg",
      `BUN_BUILD_IMAGE=${config.baseImages.build}`,
      "--build-arg",
      `BUN_RUNTIME_IMAGE=${config.baseImages.runtime}`,
      "--label",
      `org.opencontainers.image.version=${entry.version}`,
      "--label",
      `org.opencontainers.image.revision=${entry.mergeSha}`,
      "--output",
      `type=oci,dest=${resolve(root, "image.oci.tar")}`,
      "--metadata-file",
      metadata,
      ".",
    ],
    env
  );
  const built = z
    .object({ "containerimage.digest": z.string().regex(/^sha256:[a-f0-9]{64}$/) })
    .parse(JSON.parse(await readFile(metadata, "utf8")));
  const pointer = z
    .object({ editionDigest: digestSchema })
    .parse(JSON.parse(await readFile("edgeone-dist/_content/playbook/manifest.json", "utf8")));
  const manifest = productManifestSchema.parse({
    schemaVersion: 1,
    identity: entry.id,
    productVersion: entry.version,
    sourceSha: entry.mergeSha,
    staticSha256: await fileDigest(join(root, "frontend.tar.gz")),
    imageSha256: await fileDigest(join(root, "image.oci.tar")),
    imageDigest: built["containerimage.digest"],
    staticBuildVersion,
    imageBuildVersion,
    playbookEdition: pointer.editionDigest,
  });
  await writeFile(join(root, "release-manifest.json"), `${canonicalJson(manifest)}\n`);
  await sealDirectory(root, entry, "products");
  await verifyProducts(entry, root);
}
