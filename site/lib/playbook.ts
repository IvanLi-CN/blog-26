import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getRuntimePlaybookStore, validatePlaybookEdition } from "@/lib/playbook/cache";
import { getPlaybookPolicies } from "@/lib/playbook/navigation";
import type { PlaybookEdition } from "@/lib/playbook/types";

let staticEdition: Promise<PlaybookEdition | undefined> | undefined;
export async function getPlaybookEdition() {
  if (process.env.CONSOLE_RUNTIME === "true") {
    const store = getRuntimePlaybookStore();
    await store.load();
    return store.current;
  }
  staticEdition ??= readFile(
    resolve(process.env.PLAYBOOK_SEED_PATH || "site/generated/playbook-edition.json"),
    "utf8"
  )
    .then((raw) => validatePlaybookEdition(JSON.parse(raw)))
    .catch((error) => {
      if (error.code === "ENOENT" && process.env.PLAYBOOK_REQUIRED !== "true") return undefined;
      throw error;
    });
  return staticEdition;
}

export async function getPlaybookEditionForIdentity(
  editionDigest: string | undefined,
  sourceReleaseId: string | undefined,
  sourceTag: string | undefined
) {
  if (!editionDigest || !sourceReleaseId || !sourceTag) return getPlaybookEdition();
  if (!/^[a-f0-9]{64}$/u.test(editionDigest) || !/^[1-9]\d*$/u.test(sourceReleaseId))
    return undefined;
  if (process.env.CONSOLE_RUNTIME === "true") {
    const store = getRuntimePlaybookStore();
    await store.load();
    return store.getEdition(editionDigest, sourceReleaseId, sourceTag);
  }
  const current = await getPlaybookEdition();
  return current?.edition.editionDigest === editionDigest &&
    current.edition.source.releaseId === sourceReleaseId &&
    current.edition.source.tag === sourceTag
    ? current
    : undefined;
}

export async function getPlaybookStaticPaths() {
  const edition = await getPlaybookEdition();
  const paths = ["topics", "projects", "policies"];
  if (edition) {
    paths.push(...edition.catalog.topic_details.map((item) => `topics/${item.item.slug}`));
    paths.push(...edition.catalog.project_details.map((item) => `projects/${item.item.slug}`));
    paths.push(
      ...getPlaybookPolicies(edition.catalog).map((item) => `policies/${item.summary.slug}`)
    );
    const prefix = `editions/${encodeURIComponent(edition.edition.source.tag)}/${edition.edition.source.releaseId}/${edition.edition.editionDigest}`;
    paths.push(
      ...paths
        .filter((path) => /^(topics|projects|policies)(?:\/|$)/u.test(path))
        .map((path) => `${prefix}/${path}`)
    );
  }
  return paths.map((path) => ({ params: { path } }));
}
