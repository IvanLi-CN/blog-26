import { resolvePlaybookTitle } from "@/components/playbook/PlaybookPage";
import { getPlaybookEdition } from "../playbook";
import type { PageContext } from "../route-data-utils";
import { trimRouteEdition } from "../route-data-utils";
export async function loadplaybookDetail(Astro: PageContext) {
  const edition = await getPlaybookEdition();
  const path = Astro.params.path || "";
  const title = resolvePlaybookTitle(edition, path);
  if (!title) Astro.response.status = 404;
  return { edition: trimRouteEdition(edition, Astro.params.path || ""), path, title };
}
