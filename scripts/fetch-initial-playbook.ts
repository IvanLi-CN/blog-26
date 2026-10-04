import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readPublicPointer } from "../src/lib/playbook/artifacts";
import { readPublicArchive } from "../src/lib/playbook/bundle";
import { githubReleaseReader } from "../src/lib/playbook/github";
import { encodeJson } from "../src/lib/playbook/manifest";
import { resolveRelease } from "../src/lib/playbook/release";

if (
  await readPublicPointer(
    process.env.PLAYBOOK_MANIFEST_URL || "https://ivanli.cc/_content/playbook/manifest.json"
  )
)
  process.exit(0);
const reader = githubReleaseReader();
const selected = await resolveRelease(reader, { mode: "reconcile" });
if (!selected)
  throw new Error("No ready stable Playbook release is available for the initial build");
const archive = await reader.asset(selected.bundleAssetId, selected.manifest.bundle.size);
readPublicArchive(archive, selected.manifest);
const directory = resolve(".tmp/playbook-initial");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "playbook-public-manifest.json"), encodeJson(selected.manifest));
await writeFile(resolve(directory, "playbook-public.tar.gz"), archive);
if (process.env.GITHUB_ENV)
  await appendFile(process.env.GITHUB_ENV, `PLAYBOOK_BUNDLE_DIR=${directory}\n`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `bundle_dir=${directory}\n`);
console.log(`Initial bundle ready: ${selected.manifest.source.tag}`);
