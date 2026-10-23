import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readPublicPointer } from "../src/lib/playbook/artifacts";
import {
  PLAYBOOK_SOURCE_TIMESTAMP_FILE,
  parseSupplementFiles,
  readPublicArchive,
  readSupplementArchive,
} from "../src/lib/playbook/bundle";
import { githubReleaseReader } from "../src/lib/playbook/github";
import { encodeJson } from "../src/lib/playbook/manifest";
import {
  assertPublishedSourceIdentity,
  PlaybookSupplementUnavailableError,
  readSupplementAsset,
  resolveRelease,
} from "../src/lib/playbook/release";
import { PLAYBOOK_PUBLIC_POINTER_URL } from "../src/lib/playbook/schema";

const pointer = await readPublicPointer(PLAYBOOK_PUBLIC_POINTER_URL);
const reader = githubReleaseReader();
const selected = pointer
  ? await resolveRelease(reader, {
      mode: "release",
      source_repository: pointer.source.repository,
      source_release_id: pointer.source.releaseId,
      source_tag: pointer.source.tag,
      source_sha: pointer.source.commit,
      bundle_sha256: pointer.bundle.sha256,
    })
  : await resolveRelease(reader, { mode: "reconcile" });
if (!selected)
  throw new Error("No ready stable Playbook release is available for the initial build");
if (pointer) {
  assertPublishedSourceIdentity(pointer, selected.manifest);
}
const directory = resolve(".tmp/playbook-initial");
const supplementDirectory = resolve(directory, "supplement");
await mkdir(directory, { recursive: true });
await rm(supplementDirectory, { recursive: true, force: true });
if (!pointer) {
  const archive = await reader.asset(selected.bundleAssetId, selected.manifest.bundle.size);
  readPublicArchive(archive, selected.manifest, selected.sourceTimestamp);
  await writeFile(
    resolve(directory, "playbook-public-manifest.json"),
    encodeJson(selected.manifest)
  );
  await writeFile(resolve(directory, "playbook-public.tar.gz"), archive);
  await writeFile(
    resolve(directory, PLAYBOOK_SOURCE_TIMESTAMP_FILE),
    `${selected.sourceTimestamp}\n`
  );
}
if (selected.supplementStatus === "invalid") {
  console.warn("Ignoring invalid optional Playbook supplement; public bundle remains usable");
} else if (selected.supplementStatus === "unavailable") {
  console.warn("Deferring optional Playbook supplement because its assets are unavailable");
} else if (selected.supplement) {
  try {
    const supplementArchive = await readSupplementAsset(
      reader,
      selected.supplement.bundleAssetId,
      selected.supplement.manifest.bundle.size,
      "Supplement bundle asset"
    );
    parseSupplementFiles(
      readSupplementArchive(
        supplementArchive,
        selected.supplement.manifest,
        selected.sourceTimestamp
      )
    );
    await mkdir(supplementDirectory, { recursive: true });
    await writeFile(
      resolve(supplementDirectory, "playbook-private-supplement-manifest.json"),
      encodeJson(selected.supplement.manifest)
    );
    await writeFile(
      resolve(supplementDirectory, "playbook-private-supplement.tar.gz"),
      supplementArchive
    );
  } catch (error) {
    console.warn(
      `Ignoring ${error instanceof PlaybookSupplementUnavailableError ? "unavailable" : "invalid"} optional Playbook supplement; public bundle remains usable`
    );
  }
}
if (process.env.GITHUB_ENV)
  await appendFile(process.env.GITHUB_ENV, `PLAYBOOK_BUNDLE_DIR=${directory}\n`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `bundle_dir=${directory}\n`);
console.log(`Initial bundle ready: ${selected.manifest.source.tag}`);
