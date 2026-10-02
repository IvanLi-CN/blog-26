import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { downloadRetainedEdition, readPublicPointer } from "../src/lib/playbook/artifacts";
import { readPlaybookEdition } from "../src/lib/playbook/bundle";
import { encodeJson } from "../src/lib/playbook/manifest";

type SeedOptions = {
  bundleDir?: string;
  manifestUrl?: string;
  readPointer?: typeof readPublicPointer;
  rendererCommit?: string;
  snapshotPath?: string;
};

export async function loadInitialPlaybookEdition(options: SeedOptions = {}) {
  const url =
    options.manifestUrl ||
    process.env.PLAYBOOK_MANIFEST_URL ||
    "https://ivanli.cc/_content/playbook/manifest.json";
  const pointer = await (options.readPointer || readPublicPointer)(url);
  if (pointer) return downloadRetainedEdition(pointer, url, resolve(".tmp/console-playbook-seed"));

  const bundleDir = options.bundleDir || process.env.PLAYBOOK_BUNDLE_DIR;
  if (!bundleDir) return undefined;
  const snapshotPath = resolve(
    options.snapshotPath ||
      process.env.PUBLIC_SNAPSHOT_PATH ||
      "site/generated/public-snapshot.json"
  );
  const publicSnapshot = await readFile(snapshotPath);
  return readPlaybookEdition(
    bundleDir,
    options.rendererCommit || process.env.COMMIT_HASH || process.env.GITHUB_SHA || "",
    publicSnapshot
  );
}

if (import.meta.main) {
  if (process.env.PLAYBOOK_USE_DEPLOYED !== "true") process.exit(0);
  const edition = await loadInitialPlaybookEdition();
  if (!edition) throw new Error("Console requires a fixed public initial seed");
  await mkdir(resolve("site/generated"), { recursive: true });
  await writeFile(resolve("site/generated/playbook-edition.json"), encodeJson(edition));
}
