import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { playbookVersionPath, validatePlaybookEdition } from "../src/lib/playbook/cache";
import { parseEditionIdentity, verifyFile } from "../src/lib/playbook/manifest";
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
const values = new Map<string, unknown>();
for (const file of pointer.files) {
  const bytes = await readFile(resolve(base, file.path));
  verifyFile(bytes, file);
  values.set(file.path, JSON.parse(bytes.toString("utf8")));
}
const edition = validatePlaybookEdition({
  edition: pointer,
  catalog: values.get("catalog.json"),
  search: values.get("search-documents.json"),
});
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
for (const policy of getPlaybookPolicies(edition.catalog))
  for (const resource of policy.resources)
    if (
      (await readFile(resolve(base, "policies", policy.summary.slug, resource.path), "utf8")) !==
      resource.content
    )
      throw new Error("Policy resource mismatch");
if (pointer.previous) {
  const previousBase = resolve(
    root,
    `_content/playbook/${pointer.previous.tag}/${pointer.previous.editionDigest}`
  );
  const previous = parseEditionIdentity(
    JSON.parse(await readFile(resolve(previousBase, "edition.json"), "utf8"))
  );
  for (const file of previous.files)
    verifyFile(await readFile(resolve(previousBase, file.path)), file);
}
console.log(
  `Verified Playbook HTML, data, resources and retained edition: ${pointer.editionDigest}`
);
