import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readPublicPointer } from "../src/lib/playbook/artifacts";
import { readPlaybookEdition } from "../src/lib/playbook/bundle";
import { parseEditionIdentity } from "../src/lib/playbook/manifest";

if (await readPublicPointer("https://ivanli.cc/_content/playbook/manifest.json")) process.exit(0);
const pointer = parseEditionIdentity(
  JSON.parse(await readFile("edgeone-dist/_content/playbook/manifest.json", "utf8"))
);
const root = resolve(
  `edgeone-dist/_content/playbook/${pointer.source.tag}/${pointer.editionDigest}`
);
const rebuilt = await readPlaybookEdition(
  root,
  pointer.rendererCommit,
  await readFile(resolve(root, "public-snapshot.json"))
);
if (rebuilt.edition.editionDigest !== pointer.editionDigest)
  throw new Error("Initial artifact identity mismatch");
const destination = resolve(".tmp/playbook-initial");
await mkdir(destination, { recursive: true });
for (const name of [pointer.bundle.name, "playbook-public-manifest.json"])
  await writeFile(resolve(destination, name), await readFile(resolve(root, name)));
if (!process.env.GITHUB_ENV) throw new Error("GITHUB_ENV is required");
await appendFile(process.env.GITHUB_ENV, `PLAYBOOK_BUNDLE_DIR=${destination}\n`);
