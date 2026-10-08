import { getGroupedProjectCatalog } from "../projects";
import { getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { trimRouteSnapshot } from "../route-data-utils";
export async function loadprojects(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const groupedProjects = getGroupedProjectCatalog();
  const firstProjectSlug = groupedProjects[0]?.projects[0]?.slug;
  return {
    snapshot: trimRouteSnapshot(snapshot, "projects", Astro.url.pathname),
    groupedProjects,
    firstProjectSlug,
  };
}
