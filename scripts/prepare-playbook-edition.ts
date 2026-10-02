import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  downloadRetainedEdition,
  readPublicPointer,
  writePublicEdition,
} from "../src/lib/playbook/artifacts";
import { readPlaybookEdition } from "../src/lib/playbook/bundle";
import {
  encodeJson,
  parseEditionIdentity,
  samePlaybookEdition,
} from "../src/lib/playbook/manifest";

const publicRoot = resolve("public");
const seedPath = resolve("site/generated/playbook-edition.json");
const snapshotPath = resolve(
  process.env.PUBLIC_SNAPSHOT_PATH || "site/generated/public-snapshot.json"
);
const renderer =
  process.env.PLAYBOOK_RENDERER_COMMIT ||
  process.env.COMMIT_HASH ||
  process.env.GITHUB_SHA ||
  (await Bun.$`git rev-parse HEAD`.text()).trim();
const manifestUrl =
  process.env.PLAYBOOK_MANIFEST_URL || "https://ivanli.cc/_content/playbook/manifest.json";
const working = resolve(process.env.PLAYBOOK_WORK_DIR || ".tmp/playbook");
let bundleRoot = process.env.PLAYBOOK_BUNDLE_DIR;
let current: Awaited<ReturnType<typeof readPublicPointer>>;
await rm(resolve(publicRoot, "_content/playbook"), { recursive: true, force: true });
// Offline builds opt in explicitly; an ordinary local build never fetches upstream.
if (process.env.PLAYBOOK_USE_DEPLOYED === "true") {
  current = await readPublicPointer(manifestUrl);
  if (current) {
    const destination = resolve(
      publicRoot,
      `_content/playbook/${current.source.tag}/${current.editionDigest}`
    );
    await downloadRetainedEdition(current, manifestUrl, destination);
    bundleRoot ||= destination;
  }
}
if (!bundleRoot) {
  if (process.env.PLAYBOOK_REQUIRED === "true")
    throw new Error("A deployed edition or explicit initial public bundle is required");
  await rm(seedPath, { force: true });
  console.log("Playbook content is unavailable; rendering the empty state");
  process.exit(0);
}
await mkdir(working, { recursive: true });
const snapshot = await readFile(snapshotPath);
const edition = await readPlaybookEdition(resolve(bundleRoot), renderer, snapshot);
if (current) {
  if (!samePlaybookEdition(current, edition.edition))
    edition.edition.previous = { tag: current.source.tag, editionDigest: current.editionDigest };
  else if (current.previous) {
    const previousUrl = new URL(
      `./${current.previous.tag}/${current.previous.editionDigest}/edition.json`,
      manifestUrl
    );
    const response = await fetch(previousUrl, {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Previous edition could not be retained");
    const previous = parseEditionIdentity(await response.json());
    if (
      previous.editionDigest !== current.previous.editionDigest ||
      previous.source.tag !== current.previous.tag
    )
      throw new Error("Previous edition identity mismatch");
    await downloadRetainedEdition(
      previous,
      manifestUrl,
      resolve(publicRoot, `_content/playbook/${previous.source.tag}/${previous.editionDigest}`)
    );
    edition.edition.previous = current.previous;
  }
}
await writePublicEdition(publicRoot, edition, resolve(bundleRoot), snapshot);
await mkdir(resolve("site/generated"), { recursive: true });
await writeFile(seedPath, encodeJson(edition));
console.log(
  `Playbook edition ${edition.edition.editionDigest} (${edition.edition.source.tag}, renderer ${renderer})`
);
