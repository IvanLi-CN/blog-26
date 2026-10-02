import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readPublicPointer } from "../src/lib/playbook/artifacts";
import { readPublicArchive } from "../src/lib/playbook/bundle";
import { githubReleaseReader } from "../src/lib/playbook/github";
import { encodeJson } from "../src/lib/playbook/manifest";
import { resolveRelease } from "../src/lib/playbook/release";

const id = process.env.PLAYBOOK_INITIAL_RELEASE_ID;
if (
  await readPublicPointer(
    process.env.PLAYBOOK_MANIFEST_URL || "https://ivanli.cc/_content/playbook/manifest.json"
  )
)
  process.exit(0);
if (!id)
  throw new Error("The first application release requires an explicit PLAYBOOK_INITIAL_RELEASE_ID");
const reader = githubReleaseReader();
const release = await reader.release(id);
// Initial bootstrap is fixed to the owner's selected ready stable release.
const assets = release.assets;
const manifestAsset = assets.find((asset) => asset.name === "playbook-public-manifest.json");
if (!manifestAsset) throw new Error("Initial release has no readiness manifest");
const manifest = JSON.parse(new TextDecoder().decode(await reader.asset(manifestAsset.id)));
const selected = await resolveRelease(reader, {
  mode: "release",
  source_repository: "IvanLi-CN/style-playbook-skills",
  source_release_id: id,
  source_tag: release.tag_name,
  source_sha: manifest.source.commit,
  bundle_sha256: manifest.bundle.sha256,
});
if (!selected) throw new Error("Initial release is not ready");
const archive = await reader.asset(selected.bundleAssetId);
readPublicArchive(archive, selected.manifest);
const directory = resolve(".tmp/playbook-initial");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "playbook-public-manifest.json"), encodeJson(selected.manifest));
await writeFile(resolve(directory, "playbook-public.tar.gz"), archive);
if (process.env.GITHUB_ENV)
  await appendFile(process.env.GITHUB_ENV, `PLAYBOOK_BUNDLE_DIR=${directory}\n`);
console.log(`Initial bundle ready: ${selected.manifest.source.tag}`);
