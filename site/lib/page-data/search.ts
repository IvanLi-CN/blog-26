import { getPlaybookEdition } from "../playbook";
import type { PageContext } from "../route-data-utils";

export async function loadsearch(context: PageContext) {
  const edition = await getPlaybookEdition();
  const playbook = edition
    ? {
        edition: edition.edition.editionDigest,
        sourceReleaseId: edition.edition.source.releaseId,
        sourceTag: edition.edition.source.tag,
      }
    : undefined;
  return {
    playbook,
    query: context.url.searchParams.get("q") ?? "",
    mode: context.url.searchParams.get("mode") ?? "keyword",
  };
}
