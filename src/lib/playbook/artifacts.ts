import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readPlaybookEdition } from "./bundle";
import {
  fetchBounded,
  type PlaybookFetcher,
  playbookVersionPath,
  validatePlaybookEdition,
} from "./cache";
import { encodeJson, parseEditionIdentity, samePlaybookEdition, verifyFile } from "./manifest";
import { getPlaybookPolicies } from "./navigation";
import type { PlaybookEdition, PlaybookEditionIdentity } from "./types";

async function write(path: string, data: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export async function readPublicPointer(url: string, fetcher: PlaybookFetcher = fetch) {
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Public pointer unavailable: ${response.status}`);
  return parseEditionIdentity(await response.json());
}

export async function downloadRetainedEdition(
  pointer: PlaybookEditionIdentity,
  manifestUrl: string,
  destination: string,
  fetcher: PlaybookFetcher = fetch
) {
  const base = new URL(
    `.${playbookVersionPath(pointer).replace("/_content/playbook", "")}`,
    manifestUrl
  );
  const files = new Map<string, unknown>();
  for (const record of pointer.files) {
    const bytes = await fetchBounded(
      fetcher,
      new URL(record.path, base).href,
      record.size,
      AbortSignal.timeout(30_000)
    );
    verifyFile(bytes, record);
    await write(join(destination, record.path), bytes);
    files.set(record.path, JSON.parse(new TextDecoder().decode(bytes)));
  }
  const edition = validatePlaybookEdition({
    edition: pointer,
    catalog: files.get("catalog.json"),
    search: files.get("search-documents.json"),
  });
  const archive = await fetchBounded(
    fetcher,
    new URL(pointer.bundle.name, base).href,
    pointer.bundle.size,
    AbortSignal.timeout(30_000)
  );
  verifyFile(archive, {
    path: pointer.bundle.name,
    sha256: pointer.bundle.sha256,
    size: pointer.bundle.size,
  });
  await write(join(destination, pointer.bundle.name), archive);
  const manifest = await fetchBounded(
    fetcher,
    new URL("playbook-public-manifest.json", base).href,
    64 * 1024,
    AbortSignal.timeout(30_000)
  );
  await write(join(destination, "playbook-public-manifest.json"), manifest);
  const rebuilt = await readPlaybookEdition(
    destination,
    pointer.rendererCommit,
    await readFile(join(destination, "public-snapshot.json"))
  );
  if (!samePlaybookEdition(rebuilt.edition, pointer))
    throw new Error("Retained package does not reproduce the public edition");
  await write(join(destination, "edition.json"), encodeJson(pointer));
  await writePolicyResources(destination, edition);
  return edition;
}

export async function writePolicyResources(directory: string, edition: PlaybookEdition) {
  for (const policy of getPlaybookPolicies(edition.catalog)) {
    const root = join(directory, "policies", policy.summary.slug);
    await write(
      join(root, "SKILL.md"),
      `---\n${JSON.stringify(policy.frontmatter, null, 2)}\n---\n\n${policy.instruction_markdown}\n`
    );
    for (const resource of policy.resources)
      await write(join(root, resource.path), resource.content);
  }
}

export async function writePublicEdition(
  publicRoot: string,
  edition: PlaybookEdition,
  bundleRoot: string,
  publicSnapshot: Uint8Array | string
) {
  validatePlaybookEdition(edition);
  const directory = join(publicRoot, playbookVersionPath(edition.edition));
  await write(join(directory, "catalog.json"), encodeJson(edition.catalog));
  await write(join(directory, "search-documents.json"), encodeJson(edition.search));
  const snapshotFile = edition.edition.files.find((file) => file.path === "public-snapshot.json");
  if (!snapshotFile) throw new Error("Article/Memo snapshot record is missing");
  verifyFile(publicSnapshot, snapshotFile);
  await write(join(directory, "public-snapshot.json"), publicSnapshot);
  for (const name of [edition.edition.bundle.name, "playbook-public-manifest.json"])
    await write(join(directory, name), await readFile(join(bundleRoot, name)));
  await write(join(directory, "edition.json"), encodeJson(edition.edition));
  await writePolicyResources(directory, edition);
  // Written last; this source directory is published together with the HTML.
  await write(join(publicRoot, "_content/playbook/manifest.json"), encodeJson(edition.edition));
}
