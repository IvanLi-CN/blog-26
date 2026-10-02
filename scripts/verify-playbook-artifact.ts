import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readPublicArchive } from "../src/lib/playbook/bundle";
import { playbookVersionPath, validatePlaybookEdition } from "../src/lib/playbook/cache";
import {
  encodeJson,
  parseEditionIdentity,
  parseManifest,
  verifyFile,
} from "../src/lib/playbook/manifest";
import { getPlaybookPolicies } from "../src/lib/playbook/navigation";

const root = resolve(process.env.PUBLIC_EDGEONE_ARTIFACT_DIR || "site-dist");
const raw = await readFile(resolve(root, "_content/playbook/manifest.json"), "utf8").catch(
  (error) => {
    if (error.code === "ENOENT" && process.env.PLAYBOOK_REQUIRED !== "true") return undefined;
    throw error;
  }
);
if (!raw) process.exit(0);
const pointer = parseEditionIdentity(JSON.parse(raw));
const base = resolve(root, `.${playbookVersionPath(pointer)}`);

async function verifyPublishedEdition(directory: string, expected: typeof pointer, label: string) {
  const identity = parseEditionIdentity(
    JSON.parse(await readFile(resolve(directory, "edition.json"), "utf8"))
  );
  if (encodeJson(identity) !== encodeJson(expected))
    throw new Error(`${label} edition identity does not match its pointer`);
  const manifest = parseManifest(
    JSON.parse(await readFile(resolve(directory, "playbook-public-manifest.json"), "utf8"))
  );
  if (
    encodeJson(manifest.source) !== encodeJson(identity.source) ||
    encodeJson(manifest.bundle) !== encodeJson(identity.bundle)
  )
    throw new Error(`${label} public manifest identity does not match its edition`);
  const archive = await readFile(resolve(directory, manifest.bundle.name));
  verifyFile(archive, {
    path: manifest.bundle.name,
    sha256: manifest.bundle.sha256,
    size: manifest.bundle.size,
  });
  readPublicArchive(archive, manifest);
  const values = new Map<string, unknown>();
  for (const file of identity.files) {
    const bytes = await readFile(resolve(directory, file.path));
    verifyFile(bytes, file);
    if (file.path !== "public-snapshot.json")
      values.set(file.path, JSON.parse(bytes.toString("utf8")));
  }
  const edition = validatePlaybookEdition({
    edition: identity,
    catalog: values.get("catalog.json"),
    search: values.get("search-documents.json"),
  });
  for (const policy of getPlaybookPolicies(edition.catalog)) {
    const policyRoot = resolve(directory, "policies", policy.summary.slug);
    const expectedSkill = `---\n${JSON.stringify(policy.frontmatter, null, 2)}\n---\n\n${policy.instruction_markdown}\n`;
    if ((await readFile(resolve(policyRoot, "SKILL.md"), "utf8")) !== expectedSkill)
      throw new Error(`${label} Policy SKILL.md mismatch`);
    for (const resource of policy.resources)
      if ((await readFile(resolve(policyRoot, resource.path), "utf8")) !== resource.content)
        throw new Error(`${label} Policy resource mismatch`);
  }
  return edition;
}

const edition = await verifyPublishedEdition(base, pointer, "Current");
const paths = [
  "",
  "topics",
  "projects",
  "policies",
  ...edition.catalog.topic_details.map((item) => `topics/${item.item.slug}`),
  ...edition.catalog.project_details.map((item) => `projects/${item.item.slug}`),
  ...getPlaybookPolicies(edition.catalog).map((item) => `policies/${item.summary.slug}`),
];
for (const path of paths) {
  const html = await readFile(resolve(root, "playbook", path, "index.html"), "utf8");
  if (!html.includes(`data-playbook-edition="${pointer.editionDigest}"`))
    throw new Error(`HTML edition mismatch: ${path}`);
}
if (pointer.previous) {
  const previousBase = resolve(
    root,
    `_content/playbook/${pointer.previous.tag}/${pointer.previous.editionDigest}`
  );
  const previous = parseEditionIdentity(
    JSON.parse(await readFile(resolve(previousBase, "edition.json"), "utf8"))
  );
  if (
    previous.source.tag !== pointer.previous.tag ||
    previous.editionDigest !== pointer.previous.editionDigest
  )
    throw new Error("Retained previous edition identity does not match the pointer");
  await verifyPublishedEdition(previousBase, previous, "Previous");
}
console.log(
  `Verified Playbook HTML, data, resources and retained edition: ${pointer.editionDigest}`
);
