import { describe, expect, it } from "bun:test";
import { matchPublicRoute, shouldHandlePublicLink } from "../../site/lib/public-route";
import { trimRouteSnapshot } from "../../site/lib/route-data-utils";
import { SITE } from "../../src/config/site";
import { getClippingWebDemoMemo } from "../../src/lib/clipping-web-demo";
import type { PublicSnapshot } from "../../src/public-site/snapshot";

describe("public client routes", () => {
  it("does not preload unvisited clipping bodies into another route's bootstrap", () => {
    const memo = getClippingWebDemoMemo();
    if (!memo.clipping) throw new Error("Clipping fixture must include its reading projection");
    const snapshot: PublicSnapshot = {
      generatedAt: "2026-10-08T00:00:00Z",
      site: SITE,
      stats: { totalPosts: 0, categories: [] },
      posts: [],
      memos: [memo],
      relatedPosts: {},
      clippingArticles: {
        [memo.slug]: {
          reading: memo.clipping,
          source: "Unvisited source",
          translation: "Unvisited translation",
        },
      },
      tags: {
        summaries: [],
        groups: [],
        categoryIcons: {},
        tagIconMap: {},
        tagIconSvgMap: {},
        timelines: {},
      },
    };
    for (const kind of ["home", "posts", "memos", "memo", "tag"])
      expect(JSON.stringify(trimRouteSnapshot(snapshot, kind, "/posts/"))).not.toContain(
        "Unvisited"
      );
    expect(snapshot.clippingArticles?.[memo.slug]?.source).toBe("Unvisited source");
  });
  it("matches all shipped public route families without consuming service or asset URLs", () => {
    const routes = {
      "/": "home",
      "/posts/": "posts",
      "/posts/code-block-fixture/": "post",
      "/projects/": "projects",
      "/projects/xp/": "project",
      "/tags/": "tags",
      "/tags/Hardware%2FMemos/": "tag",
      "/tags/HTTP%2F1.1/": "tag",
      "/posts/release-1.0/": "post",
      "/memos/": "memos",
      "/memos/local-memo/": "memo",
      "/search/": "search",
      "/playbook/": "playbook",
      "/playbook/policies/safe-release/": "playbookDetail",
      "/about/": "about",
      "/missing/": "notFound",
    } as const;
    for (const [path, kind] of Object.entries(routes))
      expect(matchPublicRoute(path)?.kind).toBe(kind);
    for (const path of [
      "/api/public/page",
      "/admin/posts",
      "/mcp",
      "/_astro/client.js",
      "/_content/routes/posts.json",
      "/feed.xml",
      "/tags/code/feed.xml",
    ])
      expect(matchPublicRoute(path)).toBeNull();
    expect(matchPublicRoute("/posts/bad%zz")?.kind).toBe("notFound");
  });
  it("preserves native external, download, modifier and same-document fragment behavior", () => {
    const current = new URL("https://example.com/posts/one/");
    const event = {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
    };
    const link = (href: string, attributes: string[] = [], target = "") =>
      ({
        href: new URL(href, current).href,
        target,
        hasAttribute: (key: string) => attributes.includes(key),
      }) as HTMLAnchorElement;
    expect(shouldHandlePublicLink(event, link("/posts/two/"), current)).toBe(true);
    for (const anchor of [
      link("https://elsewhere.com/posts/two/"),
      link("#body"),
      link("/api/file"),
      link("/posts/two/", ["download"]),
      link("/posts/two/", [], "_blank"),
      link("/posts/two/", ["data-astro-reload"]),
    ])
      expect(shouldHandlePublicLink(event, anchor, current)).toBe(false);
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"])
      expect(shouldHandlePublicLink({ ...event, [key]: true }, link("/posts/two/"), current)).toBe(
        false
      );
    expect(shouldHandlePublicLink({ ...event, button: 1 }, link("/posts/two/"), current)).toBe(
      false
    );
  });
});
