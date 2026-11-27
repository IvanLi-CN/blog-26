import { getMemoListWebDemoRecords } from "./memo-list-web-demo";
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
  // The Demo memo pages come from the generated list fixture rather than the
  // snapshot, so their route payloads must be emitted from the same source.
  // Otherwise a prerendered memo page has no route JSON to navigate to.
  if (process.env.WEB_DEMO_BUILD === "true" && process.env.CONSOLE_WEB_DEMO_BUILD !== "true") {
    for (const memo of getMemoListWebDemoRecords()) routes.push(`/memos/${memo.slug}`);
  }
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
