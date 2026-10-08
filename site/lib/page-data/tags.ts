import { getGroupedTags, getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { trimRouteSnapshot } from "../route-data-utils";
export async function loadtags(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const groups = getGroupedTags(snapshot);
  return { snapshot: trimRouteSnapshot(snapshot, "tags", Astro.url.pathname), groups };
}
