import { getPlaybookStaticPaths } from "./playbook";
import { matchPublicRoute } from "./public-route";
import { getSnapshot, getStaticPageEntries } from "./public-site";
import { loadPublicRoute } from "./route-data";
import { toPublicSitePath } from "./runtime-urls";

export async function getStaticRouteDataEntries() {
  const snapshot = await getSnapshot();
  const routes = getStaticPageEntries(snapshot).filter((path) =>
    matchPublicRoute(toPublicSitePath(path))
  );
  for (const item of await getPlaybookStaticPaths()) routes.push(`/playbook/${item.params.path}`);
  return [...new Set([...routes, "/playbook", "/search", "/404"])].map((path) => ({
    params: {
      route: decodeURI(
        `_content/routes/${path === "/" ? "index" : path.replace(/^\/+|\/+$/g, "")}`
      ),
    },
    props: { publicPath: path },
  }));
}

export async function readStaticRouteData(request: Request, publicPath?: string) {
  // Astro params are partially decoded; preserve the raw URL segments here.
  const pathname = new URL(request.url).pathname;
  const route = pathname.slice(
    pathname.indexOf("/_content/routes/") + "/_content/routes/".length,
    -".json".length
  );
  const path = publicPath ?? (route === "index" ? "/" : `/${route}`);
  return Response.json(
    await loadPublicRoute(new Request(new URL(toPublicSitePath(path), request.url))),
    {
      headers: { "cache-control": "no-cache" },
    }
  );
}
