import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readPublicPointer } from "../src/lib/playbook/artifacts";
import {
  parseSupplementFiles,
  readPublicArchive,
  readSupplementArchive,
} from "../src/lib/playbook/bundle";
import { githubReleaseReader } from "../src/lib/playbook/github";
import { encodeJson } from "../src/lib/playbook/manifest";
import { resolveRelease } from "../src/lib/playbook/release";
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
  if (
    encodeJson(pointer.source) !== encodeJson(selected.manifest.source) ||
    encodeJson(pointer.bundle) !== encodeJson(selected.manifest.bundle)
  )
    throw new Error("Published Playbook pointer does not match its source release");
  const pointerFiles = new Map(pointer.files.map((file) => [file.path, file]));
  if (
    selected.manifest.files.some(
      (file) => encodeJson(pointerFiles.get(file.path)) !== encodeJson(file)
    )
  )
    throw new Error("Published Playbook pointer files do not match its source release");
}
const directory = resolve(".tmp/playbook-initial");
await mkdir(directory, { recursive: true });
if (!pointer) {
  const archive = await reader.asset(selected.bundleAssetId, selected.manifest.bundle.size);
  readPublicArchive(archive, selected.manifest);
  await writeFile(
    resolve(directory, "playbook-public-manifest.json"),
    encodeJson(selected.manifest)
  );
  await writeFile(resolve(directory, "playbook-public.tar.gz"), archive);
}
if (selected.supplementStatus === "invalid")
  throw new Error("Published Playbook supplement assets are invalid");
if (selected.supplement) {
  const supplementArchive = await reader.asset(
    selected.supplement.bundleAssetId,
    selected.supplement.manifest.bundle.size
  );
  parseSupplementFiles(readSupplementArchive(supplementArchive, selected.supplement.manifest));
  const supplementDirectory = resolve(directory, "supplement");
  await mkdir(supplementDirectory, { recursive: true });
  await writeFile(
    resolve(supplementDirectory, "playbook-private-supplement-manifest.json"),
    encodeJson(selected.supplement.manifest)
  );
  await writeFile(
    resolve(supplementDirectory, "playbook-private-supplement.tar.gz"),
    supplementArchive
  );
}
if (process.env.GITHUB_ENV)
  await appendFile(process.env.GITHUB_ENV, `PLAYBOOK_BUNDLE_DIR=${directory}\n`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `bundle_dir=${directory}\n`);
console.log(`Initial bundle ready: ${selected.manifest.source.tag}`);
