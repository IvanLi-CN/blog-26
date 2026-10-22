import { SourceResponseLimitError } from "./github";
import {
  decodeUtf8,
  encodeJson,
  parseEditionIdentity,
  parseJson,
  parseManifest,
  samePlaybookEdition,
  sha256,
} from "./manifest";
import {
  PLAYBOOK_MAX_BUNDLE_BYTES,
  PLAYBOOK_MAX_MANIFEST_BYTES,
  PLAYBOOK_PUBLIC_BUNDLE_NAME,
  PLAYBOOK_PUBLIC_MANIFEST_NAME,
  PLAYBOOK_REPOSITORY,
  PLAYBOOK_SUPPLEMENT_BUNDLE_NAME,
  PLAYBOOK_SUPPLEMENT_MANIFEST_NAME,
  stableTagSchema,
} from "./schema";
import type { PlaybookEditionIdentity, PlaybookManifest } from "./types";

export interface SourceRelease {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: { id: number; name: string; size: number; digest?: string | null }[];
}

export interface ReleaseReader {
  list(): Promise<SourceRelease[]>;
  release(id: string): Promise<SourceRelease>;
  commit(tag: string): Promise<string>;
  commitTimestamp(tag: string): Promise<number>;
  asset(id: number, maxBytes?: number): Promise<Uint8Array>;
}

export interface ReleaseTrigger {
  mode: "release" | "reconcile";
  source_repository?: string;
  source_release_id?: string;
  source_tag?: string;
  source_sha?: string;
  bundle_sha256?: string;
  manifest_sha256?: string;
  bundle_asset_id?: string;
  bundle_asset_digest?: string;
  bundle_asset_size?: string;
  manifest_asset_id?: string;
  manifest_asset_digest?: string;
  manifest_asset_size?: string;
  supplement_bundle_sha256?: string;
  supplement_manifest_sha256?: string;
  supplement_bundle_asset_id?: string;
  supplement_bundle_asset_digest?: string;
  supplement_bundle_asset_size?: string;
  supplement_manifest_asset_id?: string;
  supplement_manifest_asset_digest?: string;
  supplement_manifest_asset_size?: string;
  source_run_id?: string;
}

export type PlaybookSupplementStatus = "absent" | "valid" | "invalid" | "unavailable";

export class PlaybookSupplementUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlaybookSupplementUnavailableError";
  }
}

export class PlaybookSupplementInvalidError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlaybookSupplementInvalidError";
  }
}

export async function readSupplementAsset(
  reader: ReleaseReader,
  id: number,
  maxBytes: number,
  label: string
) {
  try {
    const bytes = await reader.asset(id, maxBytes);
    if (bytes.byteLength > maxBytes)
      throw new PlaybookSupplementInvalidError(
        `${label} exceeds its declared byte limit (${maxBytes})`
      );
    return bytes;
  } catch (error) {
    if (
      error instanceof SourceResponseLimitError ||
      error instanceof PlaybookSupplementInvalidError
    )
      throw new PlaybookSupplementInvalidError(`${label} failed integrity validation`, {
        cause: error,
      });
    throw new PlaybookSupplementUnavailableError(`${label} could not be read`, { cause: error });
  }
}

const SUPPLEMENT_IDENTITY_FIELDS = [
  "supplement_bundle_sha256",
  "supplement_manifest_sha256",
  "supplement_bundle_asset_id",
  "supplement_bundle_asset_digest",
  "supplement_bundle_asset_size",
  "supplement_manifest_asset_id",
  "supplement_manifest_asset_digest",
  "supplement_manifest_asset_size",
] as const;

export function hasSupplementAssetIdentity(input: ReleaseTrigger) {
  return SUPPLEMENT_IDENTITY_FIELDS.some((field) => Boolean(input[field]));
}

export function compareStableTags(a: string, b: string) {
  const parts = (tag: string) =>
    stableTagSchema.parse(tag).replace(/^v/u, "").split(".").map(BigInt);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

export function adoptionDecision(candidate: PlaybookManifest, current?: PlaybookEditionIdentity) {
  if (!current) return "update" as const;
  const sameRelease =
    candidate.source.releaseId === current.source.releaseId ||
    compareStableTags(candidate.source.tag, current.source.tag) === 0;
  if (sameRelease) {
    if (
      encodeJson(candidate.bundle) !== encodeJson(current.bundle) ||
      encodeJson(candidate.source) !== encodeJson(current.source)
    )
      throw new Error("Same release has different public content or identity");
    return "duplicate" as const;
  }
  return compareStableTags(candidate.source.tag, current.source.tag) < 0
    ? ("older" as const)
    : ("update" as const);
}

export function shouldSyncSupplement(
  current: PlaybookEditionIdentity | undefined,
  candidate: PlaybookManifest
) {
  return Boolean(current && encodeJson(current.source) === encodeJson(candidate.source));
}

function uniqueAsset(
  release: SourceRelease,
  name: string,
  required: boolean
): SourceRelease["assets"][number] | undefined {
  const matches = release.assets.filter((asset) => asset.name === name);
  if (matches.length > 1) throw new Error(`Release contains duplicate ${name} assets`);
  if (required && matches.length === 0) throw new Error(`Release is missing ${name}`);
  return matches[0];
}

function assertAssetDigest(
  asset: SourceRelease["assets"][number],
  expected: string,
  label: string
) {
  if (asset.digest && asset.digest !== expected) throw new Error(`${label} digest mismatch`);
}

async function readyManifest(reader: ReleaseReader, release: SourceRelease) {
  if (
    release.draft ||
    release.prerelease ||
    !release.published_at ||
    !stableTagSchema.safeParse(release.tag_name).success
  )
    throw new Error("Release is not stable and published");
  const manifestAsset = uniqueAsset(release, PLAYBOOK_PUBLIC_MANIFEST_NAME, true);
  const bundleAsset = uniqueAsset(release, PLAYBOOK_PUBLIC_BUNDLE_NAME, true);
  if (
    !manifestAsset ||
    !bundleAsset ||
    manifestAsset.size > PLAYBOOK_MAX_MANIFEST_BYTES ||
    bundleAsset.size > PLAYBOOK_MAX_BUNDLE_BYTES
  )
    throw new Error("Release assets are not ready");
  const manifestBytes = await reader.asset(manifestAsset.id, manifestAsset.size);
  const manifest = parseManifest(parseJson(decodeUtf8(manifestBytes, "Public manifest")), "public");
  const commit = await reader.commit(release.tag_name);
  const sourceTimestamp = await reader.commitTimestamp(release.tag_name);
  if (
    manifest.source.releaseId !== String(release.id) ||
    manifest.source.tag !== release.tag_name ||
    manifest.source.commit !== commit ||
    manifest.source.publishedAt !== release.published_at ||
    manifest.bundle.size !== bundleAsset.size
  )
    throw new Error("Release metadata does not match public manifest");
  assertAssetDigest(manifestAsset, `sha256:${sha256(manifestBytes)}`, "Public manifest asset");
  assertAssetDigest(bundleAsset, `sha256:${manifest.bundle.sha256}`, "Public bundle asset");
  let supplement:
    | {
        manifest: PlaybookManifest;
        bundleAssetId: number;
        bundleAssetSize: number;
        bundleAssetDigest?: string | null;
        manifestAssetSha256: string;
        manifestAssetId: number;
        manifestAssetSize: number;
        manifestAssetDigest?: string | null;
      }
    | undefined;
  let supplementStatus: PlaybookSupplementStatus = "absent";
  try {
    const supplementManifestAsset = uniqueAsset(release, PLAYBOOK_SUPPLEMENT_MANIFEST_NAME, false);
    const supplementBundleAsset = uniqueAsset(release, PLAYBOOK_SUPPLEMENT_BUNDLE_NAME, false);
    if (Boolean(supplementManifestAsset) !== Boolean(supplementBundleAsset))
      throw new Error("Release supplement assets are incomplete");
    if (supplementManifestAsset && supplementBundleAsset) {
      if (
        supplementManifestAsset.size > PLAYBOOK_MAX_MANIFEST_BYTES ||
        supplementBundleAsset.size > PLAYBOOK_MAX_BUNDLE_BYTES
      )
        throw new Error("Release supplement assets are not ready");
      const supplementManifestBytes = await readSupplementAsset(
        reader,
        supplementManifestAsset.id,
        supplementManifestAsset.size,
        "Supplement manifest asset"
      );
      const supplementManifest = parseManifest(
        parseJson(decodeUtf8(supplementManifestBytes, "Supplement manifest")),
        "supplement"
      );
      if (
        encodeJson(supplementManifest.source) !== encodeJson(manifest.source) ||
        supplementManifest.bundle.size !== supplementBundleAsset.size
      )
        throw new Error("Release metadata does not match supplement manifest");
      assertAssetDigest(
        supplementManifestAsset,
        `sha256:${sha256(supplementManifestBytes)}`,
        "Supplement manifest asset"
      );
      assertAssetDigest(
        supplementBundleAsset,
        `sha256:${supplementManifest.bundle.sha256}`,
        "Supplement bundle asset"
      );
      supplement = {
        manifest: supplementManifest,
        bundleAssetId: supplementBundleAsset.id,
        bundleAssetSize: supplementBundleAsset.size,
        bundleAssetDigest: supplementBundleAsset.digest,
        manifestAssetId: supplementManifestAsset.id,
        manifestAssetSize: supplementManifestAsset.size,
        manifestAssetDigest: supplementManifestAsset.digest,
        manifestAssetSha256: sha256(supplementManifestBytes),
      };
      supplementStatus = "valid";
    }
  } catch (error) {
    // The supplement is an optional admin overlay; public adoption remains valid.
    supplementStatus =
      error instanceof PlaybookSupplementUnavailableError ? "unavailable" : "invalid";
    console.warn(
      `[playbook] ignoring ${supplementStatus} supplement assets:`,
      error instanceof Error ? error.message : String(error)
    );
  }
  return {
    manifest,
    sourceTimestamp,
    bundleAssetId: bundleAsset.id,
    bundleAssetSize: bundleAsset.size,
    bundleAssetDigest: bundleAsset.digest,
    manifestAssetId: manifestAsset.id,
    manifestAssetSize: manifestAsset.size,
    manifestAssetDigest: manifestAsset.digest,
    manifestAssetSha256: sha256(manifestBytes),
    supplement,
    supplementStatus,
  };
}

function assertOptionalAssetIdentity(
  input: ReleaseTrigger,
  resolved: Awaited<ReturnType<typeof readyManifest>>
): boolean {
  const publicFields = [
    input.manifest_sha256,
    input.bundle_asset_id,
    input.bundle_asset_digest,
    input.bundle_asset_size,
    input.manifest_asset_id,
    input.manifest_asset_digest,
    input.manifest_asset_size,
  ];
  if (publicFields.some(Boolean)) {
    if (publicFields.some((value) => !value)) throw new Error("Incomplete public asset identity");
    if (
      input.manifest_sha256 !== resolved.manifestAssetSha256 ||
      input.bundle_asset_id !== String(resolved.bundleAssetId) ||
      input.bundle_asset_digest !== `sha256:${resolved.manifest.bundle.sha256}` ||
      input.bundle_asset_size !== String(resolved.bundleAssetSize) ||
      input.manifest_asset_id !== String(resolved.manifestAssetId) ||
      input.manifest_asset_digest !== `sha256:${resolved.manifestAssetSha256}` ||
      input.manifest_asset_size !== String(resolved.manifestAssetSize)
    )
      throw new Error("Public asset identity mismatch");
  }
  const supplementFields = [
    input.supplement_bundle_sha256,
    input.supplement_manifest_sha256,
    input.supplement_bundle_asset_id,
    input.supplement_bundle_asset_digest,
    input.supplement_bundle_asset_size,
    input.supplement_manifest_asset_id,
    input.supplement_manifest_asset_digest,
    input.supplement_manifest_asset_size,
  ];
  if (!resolved.supplement) {
    if (resolved.supplementStatus === "unavailable") {
      if (hasSupplementAssetIdentity(input))
        console.warn(
          "[playbook] supplement identity cannot be checked while assets are unavailable"
        );
      return true;
    }
    if (hasSupplementAssetIdentity(input))
      console.warn(
        "[playbook] ignoring supplement identity because supplement assets are unavailable"
      );
    return !hasSupplementAssetIdentity(input);
  }
  if (!supplementFields.some(Boolean)) return true;
  if (supplementFields.some((value) => !value)) {
    console.warn("[playbook] ignoring incomplete optional supplement asset identity");
    return false;
  }
  const supplement = resolved.supplement;
  if (
    input.supplement_bundle_sha256 !== supplement.manifest.bundle.sha256 ||
    input.supplement_manifest_sha256 !== supplement.manifestAssetSha256 ||
    input.supplement_bundle_asset_id !== String(supplement.bundleAssetId) ||
    input.supplement_bundle_asset_digest !== `sha256:${supplement.manifest.bundle.sha256}` ||
    input.supplement_bundle_asset_size !== String(supplement.bundleAssetSize) ||
    input.supplement_manifest_asset_id !== String(supplement.manifestAssetId) ||
    input.supplement_manifest_asset_digest !== `sha256:${supplement.manifestAssetSha256}` ||
    input.supplement_manifest_asset_size !== String(supplement.manifestAssetSize)
  ) {
    console.warn("[playbook] ignoring mismatched optional supplement asset identity");
    return false;
  }
  return true;
}

export async function resolveRelease(reader: ReleaseReader, input: ReleaseTrigger) {
  if (input.mode === "release") {
    if (
      input.source_repository !== PLAYBOOK_REPOSITORY ||
      !input.source_release_id ||
      !input.source_tag ||
      !input.source_sha ||
      !input.bundle_sha256
    )
      throw new Error("Incomplete or untrusted release trigger");
    const resolved = await readyManifest(reader, await reader.release(input.source_release_id));
    const { manifest } = resolved;
    if (
      manifest.source.releaseId !== input.source_release_id ||
      manifest.source.tag !== input.source_tag ||
      manifest.source.commit !== input.source_sha ||
      manifest.bundle.sha256 !== input.bundle_sha256
    )
      throw new Error("Notification identity mismatch");
    if (!assertOptionalAssetIdentity(input, resolved))
      return { ...resolved, supplement: undefined, supplementStatus: "invalid" as const };
    return resolved;
  }
  if (
    input.mode !== "reconcile" ||
    [
      input.source_repository,
      input.source_release_id,
      input.source_tag,
      input.source_sha,
      input.bundle_sha256,
    ].some(Boolean)
  )
    throw new Error("Reconcile cannot accept caller-selected sources");
  const candidates = (await reader.list()).filter(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      release.published_at &&
      stableTagSchema.safeParse(release.tag_name).success &&
      release.assets.some((asset) => asset.name === "playbook-public-manifest.json") &&
      release.assets.some((asset) => asset.name === "playbook-public.tar.gz")
  );
  candidates.sort((a, b) => compareStableTags(b.tag_name, a.tag_name));
  for (const candidate of candidates) {
    // An incomplete/corrupt release does not hide an older ready stable release.
    try {
      return await readyManifest(reader, candidate);
    } catch {
      /* Continue to the next ready stable candidate. */
    }
  }
  return undefined;
}

export interface DeploymentAdapter {
  current(): Promise<PlaybookEditionIdentity | undefined>;
  build(
    manifest: PlaybookManifest,
    renderer: string,
    current?: PlaybookEditionIdentity
  ): Promise<PlaybookEditionIdentity>;
  deploy(edition: PlaybookEditionIdentity): Promise<void>;
  verify(edition: PlaybookEditionIdentity): Promise<void>;
}

function matchesBuildIdentity(
  edition: PlaybookEditionIdentity,
  manifest: PlaybookManifest,
  rendererCommit: string,
  current: PlaybookEditionIdentity
) {
  try {
    parseEditionIdentity(edition);
  } catch {
    return false;
  }
  return (
    edition.rendererCommit === rendererCommit &&
    edition.contentSnapshotIdentity === current.contentSnapshotIdentity &&
    edition.generatedAt === manifest.source.publishedAt &&
    encodeJson(edition.bundle) === encodeJson(manifest.bundle) &&
    encodeJson(edition.source) === encodeJson(manifest.source)
  );
}

function matchesPublishedManifest(edition: PlaybookEditionIdentity, manifest: PlaybookManifest) {
  return (
    encodeJson(edition.source) === encodeJson(manifest.source) &&
    encodeJson(edition.bundle) === encodeJson(manifest.bundle)
  );
}

function assertOlderRollbackTarget(target: PlaybookManifest, current: PlaybookEditionIdentity) {
  if (
    compareStableTags(target.source.tag, current.source.tag) >= 0 &&
    !matchesPublishedManifest(current, target)
  )
    throw new Error("Rollback target must be older than the current stable release");
}

// Must be called inside the production lock. No app version or image is created.
export async function deployContent(
  adapter: DeploymentAdapter,
  manifest: PlaybookManifest,
  options: { rollback?: boolean; automaticUpdatesEnabled: boolean }
) {
  if (options.rollback && options.automaticUpdatesEnabled)
    throw new Error("Pause automatic updates before rollback");
  if (!options.rollback && !options.automaticUpdatesEnabled) return "paused";
  let current = await adapter.current();
  if (!options.rollback) {
    const decision = adoptionDecision(manifest, current);
    if (decision !== "update") return decision;
  }
  if (!current) throw new Error("Initial deployment must use the normal application release");
  if (options.rollback && matchesPublishedManifest(current, manifest)) {
    await adapter.verify(current);
    return "deployed";
  }
  if (options.rollback) assertOlderRollbackTarget(manifest, current);
  // Also supports adapters where preparation can outlive a renderer publication.
  for (let attempt = 0; attempt < 3; attempt++) {
    const edition = await adapter.build(manifest, current.rendererCommit, current);
    if (!matchesBuildIdentity(edition, manifest, current.rendererCommit, current))
      throw new Error("Build identity does not match the fixed inputs");
    const latest = await adapter.current();
    if (!latest) throw new Error("Deployed renderer identity disappeared");
    if (options.rollback) {
      if (matchesPublishedManifest(latest, manifest)) {
        await adapter.verify(latest);
        return "deployed";
      }
      assertOlderRollbackTarget(manifest, latest);
    } else {
      const decision = adoptionDecision(manifest, latest);
      if (decision !== "update") return decision;
    }
    if (latest.rendererCommit !== edition.rendererCommit || !samePlaybookEdition(latest, current)) {
      current = latest;
      continue;
    }
    await adapter.deploy(edition);
    await adapter.verify(edition);
    return "deployed";
  }
  throw new Error("Deployment inputs kept changing; retry with the current renderer");
}
