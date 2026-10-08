import { getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { trimRouteSnapshot } from "../route-data-utils";
export async function loadposts(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const assetVersion = snapshot.generatedAt;
  return { snapshot: trimRouteSnapshot(snapshot, "posts", Astro.url.pathname), assetVersion };
}
