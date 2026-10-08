import { loadabout } from "./page-data/about";
import { loadhome } from "./page-data/home";
import { loadmemo } from "./page-data/memo";
import { loadmemos } from "./page-data/memos";
import { loadnotFound } from "./page-data/notFound";
import { loadplaybook } from "./page-data/playbook";
import { loadplaybookDetail } from "./page-data/playbookDetail";
import { loadpost } from "./page-data/post";
import { loadposts } from "./page-data/posts";
import { loadproject } from "./page-data/project";
import { loadprojects } from "./page-data/projects";
import { loadsearch } from "./page-data/search";
import { loadtag } from "./page-data/tag";
import { loadtags } from "./page-data/tags";
import { matchPublicRoute } from "./public-route";
import { PublicRouteNotFound } from "./route-data-utils";

export async function loadPublicRoute(request: Request) {
  const url = new URL(request.url);
  const route = matchPublicRoute(url.pathname);
  if (!route) return { kind: "notFound" as const, data: {} };
  const context = { url, request, params: route.params, props: {}, response: { status: 200 } };
  try {
    switch (route.kind) {
      case "home":
        return { kind: "home" as const, data: await loadhome(context) };
      case "posts":
        return { kind: "posts" as const, data: await loadposts(context) };
      case "post":
        return { kind: "post" as const, data: await loadpost(context) };
      case "projects":
        return { kind: "projects" as const, data: await loadprojects(context) };
      case "project":
        return { kind: "project" as const, data: await loadproject(context) };
      case "tags":
        return { kind: "tags" as const, data: await loadtags(context) };
      case "tag":
        return { kind: "tag" as const, data: await loadtag(context) };
      case "memos":
        return { kind: "memos" as const, data: await loadmemos(context) };
      case "memo":
        return { kind: "memo" as const, data: await loadmemo(context) };
      case "playbook":
        return { kind: "playbook" as const, data: await loadplaybook(context) };
      case "playbookDetail": {
        const data = await loadplaybookDetail(context);
        return data.title
          ? { kind: "playbookDetail" as const, data }
          : { kind: "notFound" as const, data: await loadnotFound(context) };
      }
      case "search":
        return { kind: "search" as const, data: await loadsearch(context) };
      case "about":
        return { kind: "about" as const, data: await loadabout(context) };
      case "notFound":
        return { kind: "notFound" as const, data: await loadnotFound(context) };
    }
  } catch (error) {
    if (!(error instanceof PublicRouteNotFound)) throw error;
    return { kind: "notFound" as const, data: await loadnotFound(context) };
  }
}

export type PublicRoutePayload = Awaited<ReturnType<typeof loadPublicRoute>>;
