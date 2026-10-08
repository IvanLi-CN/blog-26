import { playbookVersionPath } from "@/lib/playbook/cache";
import { createPlaybookSearchPages } from "@/lib/playbook/search";
import { getPlaybookEdition } from "../playbook";
import type { PageContext } from "../route-data-utils";
import { toPublicApiUrl, toPublicSitePath } from "../runtime-urls";

export async function loadsearch(context: PageContext) {
  const edition = await getPlaybookEdition();
  const searchHash = edition?.edition.files.find(
    (file) => file.path === "search-documents.json"
  )?.sha256;
  if (edition && !searchHash) throw new Error("Playbook search index is missing its checksum");
  const playbook =
    edition && searchHash
      ? {
          pages: createPlaybookSearchPages(edition.catalog),
          edition: edition.edition.editionDigest,
          sourceReleaseId: edition.edition.source.releaseId,
          sourceTag: edition.edition.source.tag,
          sha256: searchHash,
          url:
            process.env.CONSOLE_RUNTIME === "true"
              ? toPublicApiUrl(
                  `/api/public/playbook/search-index?edition=${edition.edition.editionDigest}&sourceReleaseId=${encodeURIComponent(edition.edition.source.releaseId)}&sourceTag=${encodeURIComponent(edition.edition.source.tag)}`
                )
              : toPublicSitePath(`${playbookVersionPath(edition.edition)}search-documents.json`),
        }
      : undefined;
  return { playbook, query: context.url.searchParams.get("q") ?? "" };
}
