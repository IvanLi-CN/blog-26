import { resolvePlaybookTitle } from "@/components/playbook/PlaybookPage";
import { getPlaybookEditionForIdentity } from "../playbook";
import { matchPublicRoute } from "../public-route";
import type { PageContext } from "../route-data-utils";
import { trimRouteEdition } from "../route-data-utils";
export async function loadplaybookDetail(Astro: PageContext) {
  const matched = matchPublicRoute(Astro.url.pathname);
  const routeParams = matched?.kind === "playbookDetail" ? matched.params : Astro.params;
  const edition = await getPlaybookEditionForIdentity(
    routeParams.editionDigest,
    routeParams.editionReleaseId,
    routeParams.editionTag
  );
  const path = routeParams.path || Astro.params.path || "";
  const title = resolvePlaybookTitle(edition, path);
  if (!title) Astro.response.status = 404;
  return {
    edition: trimRouteEdition(edition, path),
    path,
    title,
    versioned: Boolean(routeParams.editionDigest),
  };
}
