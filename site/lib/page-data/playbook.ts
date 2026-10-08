import { getPlaybookEdition } from "../playbook";
import type { PageContext } from "../route-data-utils";
import { trimRouteEdition } from "../route-data-utils";
export async function loadplaybook(Astro: PageContext) {
  const edition = await getPlaybookEdition();
  return { edition: trimRouteEdition(edition, Astro.params.path || "") };
}
