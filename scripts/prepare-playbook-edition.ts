import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  downloadRetainedEdition,
  readPublicPointer,
  writePublicEdition,
} from "../src/lib/playbook/artifacts";
import { readPlaybookEdition } from "../src/lib/playbook/bundle";
import { validatePlaybookEdition } from "../src/lib/playbook/cache";
import {
  encodeJson,
  parseEditionIdentity,
  samePlaybookEdition,
} from "../src/lib/playbook/manifest";
import { PLAYBOOK_PUBLIC_POINTER_URL } from "../src/lib/playbook/schema";

const publicRoot = resolve("public");
const seedPath = resolve("site/generated/playbook-edition.json");
if (process.env.PLAYBOOK_FROZEN_INPUT_DIR) {
  const frozen = resolve(process.env.PLAYBOOK_FROZEN_INPUT_DIR);
  const seed = validatePlaybookEdition(
    JSON.parse(await readFile(join(frozen, "playbook-edition.json"), "utf8"))
  );
  const pointer = parseEditionIdentity(
    JSON.parse(await readFile(join(frozen, "playbook/manifest.json"), "utf8"))
  );
  if (
    !samePlaybookEdition(seed.edition, pointer) ||
    seed.edition.rendererCommit !== process.env.COMMIT_HASH
  )
    throw new Error("Frozen Playbook input does not match the renderer");
  await rm(join(publicRoot, "_content/playbook"), { recursive: true, force: true });
  await cp(join(frozen, "playbook"), join(publicRoot, "_content/playbook"), { recursive: true });
  await mkdir(resolve("site/generated"), { recursive: true });
  await writeFile(seedPath, encodeJson(seed));
  console.log(`Reusing frozen Playbook edition ${pointer.editionDigest}`);
  process.exit(0);
}
const snapshotPath = resolve(
  process.env.PUBLIC_SNAPSHOT_PATH || "site/generated/public-snapshot.json"
);
const renderer =
  process.env.PLAYBOOK_RENDERER_COMMIT ||
  process.env.COMMIT_HASH ||
  process.env.GITHUB_SHA ||
  (await Bun.$`git rev-parse HEAD`.text()).trim();
const manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL;
const working = resolve(process.env.PLAYBOOK_WORK_DIR || ".tmp/playbook");
let bundleRoot = process.env.PLAYBOOK_BUNDLE_DIR;
let current: Awaited<ReturnType<typeof readPublicPointer>>;
const inputPath = process.env.PLAYBOOK_EDITION_INPUT_PATH;
const inputSeed = inputPath
  ? validatePlaybookEdition(JSON.parse(await readFile(resolve(inputPath), "utf8")))
  : undefined;
await rm(resolve(publicRoot, "_content/playbook"), { recursive: true, force: true });
await mkdir(working, { recursive: true });
let snapshot: Uint8Array | undefined;

// A deployed frontend seed is the immutable cross-artifact contract for image builds.
if (inputSeed) {
  const inputEdition = inputSeed.edition;
  const destination = resolve(working, "deployed-input");
  await rm(destination, { recursive: true, force: true });
  await downloadRetainedEdition(inputEdition, manifestUrl, destination);
  bundleRoot = destination;
  current = inputEdition;
  snapshot = await readFile(join(destination, "public-snapshot.json"));
}
// Offline builds opt in explicitly; an ordinary local build never fetches upstream.
if (!inputSeed && process.env.PLAYBOOK_USE_DEPLOYED === "true") {
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
snapshot ||= await readFile(snapshotPath);
const edition = inputSeed
  ? inputSeed
  : await readPlaybookEdition(resolve(bundleRoot), renderer, snapshot);
validatePlaybookEdition(edition);
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
  `Playbook edition ${edition.edition.editionDigest} (${edition.edition.source.tag}, renderer ${edition.edition.rendererCommit})`
);
