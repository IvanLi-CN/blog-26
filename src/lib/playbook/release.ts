import { encodeJson, parseEditionIdentity, parseManifest, samePlaybookEdition } from "./manifest";
import {
  PLAYBOOK_MAX_BUNDLE_BYTES,
  PLAYBOOK_MAX_MANIFEST_BYTES,
  PLAYBOOK_REPOSITORY,
  stableTagSchema,
} from "./schema";
import type { PlaybookEditionIdentity, PlaybookManifest } from "./types";

export interface SourceRelease {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: { id: number; name: string; size: number }[];
}

export interface ReleaseReader {
  list(): Promise<SourceRelease[]>;
  release(id: string): Promise<SourceRelease>;
  commit(tag: string): Promise<string>;
  asset(id: number, maxBytes?: number): Promise<Uint8Array>;
}

export interface ReleaseTrigger {
  mode: "release" | "reconcile";
  source_repository?: string;
  source_release_id?: string;
  source_tag?: string;
  source_sha?: string;
  bundle_sha256?: string;
  source_run_id?: string;
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

async function readyManifest(reader: ReleaseReader, release: SourceRelease) {
  if (
    release.draft ||
    release.prerelease ||
    !release.published_at ||
    !stableTagSchema.safeParse(release.tag_name).success
  )
    throw new Error("Release is not stable and published");
  const manifestAsset = release.assets.find(
    (asset) => asset.name === "playbook-public-manifest.json"
  );
  const bundleAsset = release.assets.find((asset) => asset.name === "playbook-public.tar.gz");
  if (
    !manifestAsset ||
    !bundleAsset ||
    manifestAsset.size > PLAYBOOK_MAX_MANIFEST_BYTES ||
    bundleAsset.size > PLAYBOOK_MAX_BUNDLE_BYTES
  )
    throw new Error("Release assets are not ready");
  const manifest = parseManifest(
    JSON.parse(new TextDecoder().decode(await reader.asset(manifestAsset.id, manifestAsset.size)))
  );
  const commit = await reader.commit(release.tag_name);
  if (
    manifest.source.releaseId !== String(release.id) ||
    manifest.source.tag !== release.tag_name ||
    manifest.source.commit !== commit ||
    manifest.source.publishedAt !== release.published_at ||
    manifest.bundle.size !== bundleAsset.size
  )
    throw new Error("Release metadata does not match public manifest");
  return { manifest, bundleAssetId: bundleAsset.id };
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
  // Also supports adapters where preparation can outlive a renderer publication.
  for (let attempt = 0; attempt < 3; attempt++) {
    const edition = await adapter.build(manifest, current.rendererCommit, current);
    if (!matchesBuildIdentity(edition, manifest, current.rendererCommit, current))
      throw new Error("Build identity does not match the fixed inputs");
    const latest = await adapter.current();
    if (!latest) throw new Error("Deployed renderer identity disappeared");
    if (!options.rollback) {
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
