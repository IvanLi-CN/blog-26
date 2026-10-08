import { getPublicSiteBasePath } from "@/lib/public-runtime-url";

export type PublicRouteKind =
  | "home"
  | "posts"
  | "post"
  | "projects"
  | "project"
  | "tags"
  | "tag"
  | "memos"
  | "memo"
  | "playbook"
  | "playbookDetail"
  | "search"
  | "about"
  | "notFound";
export interface PublicRoute {
  kind: PublicRouteKind;
  path: string;
  params: Record<string, string>;
}

/** Fragments and Inspector state do not identify a different product page. */
export function publicRouteIdentity(url: URL) {
  const query = new URLSearchParams(url.search);
  for (const key of [...query.keys()]) if (key.startsWith("d_")) query.delete(key);
  return `${matchPublicRoute(url.pathname)?.path ?? url.pathname}?${query}`;
}

export function matchPublicRoute(pathname: string): PublicRoute | null {
  const base = getPublicSiteBasePath();
  if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const path = (pathname.slice(base.length) || "/").replace(/\/+$/, "") || "/";
  if (/^\/(api|admin|mcp|_astro|_content)(\/|$)/.test(path)) return null;
  if (
    /^\/(feed\.xml|rss\.xml|atom\.xml|feed\.json)$/.test(path) ||
    /^\/tags\/.+\/(feed|rss|atom)\.(xml|json)$/.test(path)
  )
    return null;
  const staticRoutes: Record<string, PublicRouteKind> = {
    "/": "home",
    "/posts": "posts",
    "/projects": "projects",
    "/tags": "tags",
    "/memos": "memos",
    "/playbook": "playbook",
    "/search": "search",
    "/about": "about",
    "/404": "notFound",
  };
  if (staticRoutes[path]) return { kind: staticRoutes[path], path, params: {} };
  const detail = /^\/(posts|projects|memos)\/([^/]+)$/.exec(path);
  if (detail) {
    try {
      return {
        kind: detail[1] === "posts" ? "post" : detail[1] === "projects" ? "project" : "memo",
        path,
        params: { slug: decodeURIComponent(detail[2]) },
      };
    } catch {
      return { kind: "notFound", path, params: {} };
    }
  }
  if (path.startsWith("/tags/"))
    return { kind: "tag", path, params: { tagSegments: path.slice(6) } };
  if (path.startsWith("/playbook/"))
    return { kind: "playbookDetail", path, params: { path: path.slice(10) } };
  if (/\.[a-z0-9]+$/i.test(path)) return null;
  return { kind: "notFound", path, params: {} };
}

export function shouldHandlePublicLink(
  event: Pick<
    MouseEvent,
    "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented"
  >,
  anchor: HTMLAnchorElement,
  current: URL
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return false;
  if (
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self") ||
    anchor.hasAttribute("data-astro-reload")
  )
    return false;
  const target = new URL(anchor.href, current);
  if (target.origin !== current.origin || !matchPublicRoute(target.pathname)) return false;
  return !(target.pathname === current.pathname && target.search === current.search && target.hash);
}
