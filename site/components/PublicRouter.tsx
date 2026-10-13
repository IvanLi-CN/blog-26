import { type ReactNode, useEffect, useRef, useState } from "react";
import { SITE } from "@/config/site";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import {
  getWebDemoSceneState,
  isWebDemoBuildEnabled,
  WEB_DEMO_STATE_EVENT,
  type WebDemoStateChangeDetail,
} from "@/lib/web-demo-runtime";
import { matchPublicRoute, publicRouteIdentity, shouldHandlePublicLink } from "../lib/public-route";
import { isAsyncPublicRouteKind } from "../lib/public-route-skeleton";
import { getCanonicalUrl } from "../lib/public-site-client";
import type { PublicRoutePayload } from "../lib/route-data";
import { publicRouteMetadata } from "../lib/route-metadata";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";
import { PublicRouteError, PublicRouteSkeleton } from "./PublicRouteSkeleton";
import About from "./pages/about";
import Home from "./pages/home";
import Memo from "./pages/memo";
import Memos from "./pages/memos";
import NotFound from "./pages/notFound";
import Playbook from "./pages/playbook";
import PlaybookDetail from "./pages/playbookDetail";
import Post from "./pages/post";
import Posts from "./pages/posts";
import Project from "./pages/project";
import Projects from "./pages/projects";
import Tag from "./pages/tag";
import Tags from "./pages/tags";
import SearchPageIsland from "./SearchPageIsland";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import "../styles/public-pages.css";

function Page({
  payload,
  searchBootstrap,
}: {
  payload: PublicRoutePayload;
  searchBootstrap?: ReactNode;
}) {
  switch (payload.kind) {
    case "home":
      return <Home {...payload.data} />;
    case "posts":
      return <Posts {...payload.data} />;
    case "post":
      return <Post {...payload.data} />;
    case "projects":
      return <Projects {...payload.data} />;
    case "project":
      return <Project {...payload.data} />;
    case "tags":
      return <Tags {...payload.data} />;
    case "tag":
      return <Tag {...payload.data} />;
    case "memos":
      return <Memos {...payload.data} />;
    case "memo":
      return <Memo {...payload.data} />;
    case "playbook":
      return <Playbook {...payload.data} />;
    case "playbookDetail":
      return <PlaybookDetail {...payload.data} />;
    case "about":
      return <About {...payload.data} />;
    case "notFound":
      return <NotFound {...payload.data} />;
    case "search":
      return (
        <>
          {searchBootstrap}
          <div data-search-island>
            <SearchPageIsland
              playbook={payload.data.playbook}
              initialQuery={payload.data.query}
              initialMode={payload.data.mode}
            />
          </div>
        </>
      );
  }
}

export async function readPublicRoute(url: URL, signal: AbortSignal): Promise<PublicRoutePayload> {
  const route = matchPublicRoute(url.pathname);
  if (!route) throw new Error("Unknown public route");
  const requestUrl = new URL(url);
  if (isWebDemoBuildEnabled()) {
    const scene = getWebDemoSceneState(window.location, "public");
    requestUrl.searchParams.set("d_scene", scene.scene);
    requestUrl.searchParams.set("d_data", scene.data);
  }
  const endpoint =
    process.env.CONSOLE_RUNTIME === "true" || process.env.WEB_DEMO_BUILD === "true"
      ? toPublicApiUrl(
          `/api/public/page?path=${encodeURIComponent(requestUrl.pathname + requestUrl.search)}`
        )
      : toPublicSitePath(
          `/_content/routes/${route.path === "/" ? "index" : route.path.slice(1)}.json`
        );
  const response = await webDemoFetch(endpoint, { signal, cache: "no-store" });
  if (response.status === 404) return { kind: "notFound", data: {} };
  if (!response.ok) throw new Error("页面内容暂时无法读取，请重试。");
  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("kind" in payload) ||
    !("data" in payload) ||
    (payload.kind !== route.kind && payload.kind !== "notFound") ||
    !payload.data ||
    typeof payload.data !== "object"
  )
    throw new Error("页面内容暂时无法读取，请重试。");
  const data = payload as PublicRoutePayload;
  return data.kind === "search"
    ? { ...data, data: { ...data.data, query: url.searchParams.get("q") ?? "" } }
    : data;
}

export default function PublicRouter({
  initial,
  initialUrl,
  about,
  searchBootstrap,
}: {
  initial: PublicRoutePayload;
  initialUrl?: string;
  about?: Extract<PublicRoutePayload, { kind: "about" }>;
  searchBootstrap?: ReactNode;
}) {
  const [url, setUrl] = useState(
    initialUrl ??
      (typeof window === "undefined"
        ? "/"
        : window.location.pathname + window.location.search + window.location.hash)
  );
  const [payload, setPayload] = useState<PublicRoutePayload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [scrollRevision, setScrollRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const stateRef = useRef({ payload, error });
  const urlRef = useRef(url);
  urlRef.current = url;
  stateRef.current = { payload, error };
  const pendingScroll = useRef<{
    position: { top: number; left: number } | null;
    restore: boolean;
    userPosition: { top: number; left: number } | null;
    restorationAttempted: boolean;
    programmaticPosition: { top: number; left: number } | null;
  } | null>(null);
  const navigationStarted = useRef(false);
  const navigateRef = useRef<
    (
      target: URL,
      mode: "push" | "pop" | "retry",
      restoredScroll?: { top: number; left: number } | null
    ) => void
  >(() => {
    /* Assigned on each render. */
  });
  const route = matchPublicRoute(new URL(url, "https://public.invalid").pathname);

  navigateRef.current = (target, mode, restoredScroll) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const ticket = ++generation.current;
    navigationStarted.current = true;
    document.dispatchEvent(new Event("astro:before-swap"));
    if (mode === "push") {
      const pending = pendingScroll.current;
      const persistedPosition = pending?.userPosition ??
        window.history.state?.publicCsrScroll ?? { top: window.scrollY, left: window.scrollX };
      window.history.replaceState(
        {
          ...window.history.state,
          publicCsrScroll: persistedPosition,
        },
        ""
      );
      window.history.pushState({ publicCsr: true }, "", target);
    }
    pendingScroll.current = {
      position:
        mode === "pop" ? (restoredScroll ?? window.history.state?.publicCsrScroll ?? null) : null,
      restore: mode === "pop",
      userPosition: null,
      restorationAttempted: false,
      programmaticPosition: null,
    };
    setUrl(target.pathname + target.search + target.hash);
    setError(null);
    if (mode !== "pop") window.scrollTo({ top: 0, behavior: "instant" });
    const targetRoute = matchPublicRoute(target.pathname);
    const isAsyncTarget = isAsyncPublicRouteKind(targetRoute?.kind);
    if (targetRoute?.kind === "notFound") setPayload({ kind: "notFound", data: {} });
    else if (targetRoute?.kind === "about" && about) setPayload(about);
    else if (isAsyncTarget) setPayload(null);
    else setPayload({ kind: "notFound", data: {} });
    const load =
      targetRoute?.kind === "notFound"
        ? Promise.resolve({ kind: "notFound" as const, data: {} })
        : targetRoute?.kind === "about" && about
          ? Promise.resolve(about)
          : readPublicRoute(target, controller.signal);
    void load
      .then((data) => {
        if (controller.signal.aborted || ticket !== generation.current) return;
        setPayload(data);
      })
      .catch((cause) => {
        if (controller.signal.aborted || ticket !== generation.current) return;
        setError(
          cause instanceof TypeError
            ? "无法连接服务器，请检查网络连接后重试。"
            : "页面内容暂时无法读取，请重试。"
        );
      });
  };

  useEffect(() => {
    // A prerendered document cannot know the browser's query or fragment.
    const current = new URL(window.location.href);
    setUrl(current.pathname + current.search + current.hash);
    if (stateRef.current.payload?.kind === "search") {
      const data = stateRef.current.payload;
      setPayload({ ...data, data: { ...data.data, query: current.searchParams.get("q") ?? "" } });
    }
    const click = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || !shouldHandlePublicLink(event, anchor, new URL(window.location.href))) return;
      event.preventDefault();
      navigateRef.current(new URL(anchor.href), "push");
    };
    const pop = (event: PopStateEvent) => {
      const target = new URL(window.location.href);
      const restoredScroll = event.state?.publicCsrScroll ?? null;
      if (
        publicRouteIdentity(target) ===
          publicRouteIdentity(new URL(urlRef.current, target.origin)) &&
        stateRef.current.payload
      ) {
        setUrl(target.pathname + target.search + target.hash);
        navigationStarted.current = true;
        pendingScroll.current = {
          position: restoredScroll,
          restore: true,
          userPosition: null,
          restorationAttempted: false,
          programmaticPosition: null,
        };
        // Distinct history entries can share the same URL but reading positions.
        setScrollRevision((revision) => revision + 1);
        return;
      }
      navigateRef.current(target, "pop", restoredScroll);
    };
    const environment = (event: Event) => {
      const detail = (event as CustomEvent<WebDemoStateChangeDetail>).detail;
      const changed = detail?.changed ?? [];
      const sceneChanged = changed.some((field) => field === "scene" || field === "data");
      const environmentChanged = changed.some((field) =>
        ["persona", "connection", "delay"].includes(field)
      );
      if (
        sceneChanged ||
        (environmentChanged && (stateRef.current.error || !stateRef.current.payload))
      )
        navigateRef.current(new URL(window.location.href), "retry");
    };
    const submit = (event: SubmitEvent) => {
      const form = event.target;
      if (
        event.defaultPrevented ||
        !(form instanceof HTMLFormElement) ||
        form.method.toLowerCase() !== "get" ||
        form.target
      )
        return;
      const target = new URL(form.action, window.location.href);
      if (target.origin !== window.location.origin || !matchPublicRoute(target.pathname)) return;
      event.preventDefault();
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form))
        if (typeof value === "string") params.append(key, value);
      target.search = params.toString();
      navigateRef.current(target, "push");
    };
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const saveScroll = () => {
      const current = { top: window.scrollY, left: window.scrollX };
      const pending = pendingScroll.current;
      if (pending) {
        // Ignore route-swap geometry and the router's own restore scroll. A
        // user scroll during settling becomes the position saved for a later push.
        const expected = pending.programmaticPosition;
        if (
          pending.restorationAttempted &&
          (!expected || current.top !== expected.top || current.left !== expected.left)
        )
          pending.userPosition = current;
        return;
      }
      window.history.replaceState({ ...window.history.state, publicCsrScroll: current }, "");
    };
    saveScroll();
    window.addEventListener("scroll", saveScroll, { passive: true });
    document.addEventListener("click", click);
    window.addEventListener("popstate", pop);
    document.addEventListener("submit", submit);
    window.addEventListener(WEB_DEMO_STATE_EVENT, environment);
    void import("../lib/public-page-behaviors").then(() =>
      document.dispatchEvent(new Event("astro:page-load"))
    );
    return () => {
      request.current?.abort();
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("scroll", saveScroll);
      document.removeEventListener("click", click);
      window.removeEventListener("popstate", pop);
      document.removeEventListener("submit", submit);
      window.removeEventListener(WEB_DEMO_STATE_EVENT, environment);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Same-URL history entries must also restore their distinct reading positions.
  useEffect(() => {
    const navigationPending = isAsyncPublicRouteKind(route?.kind) && !payload && !error;
    document.documentElement.dataset.publicNavigationState = navigationPending ? "loading" : "idle";
    document.documentElement.toggleAttribute("data-public-navigation-pending", navigationPending);
    document
      .getElementById("public-route-loading")
      ?.setAttribute("aria-hidden", navigationPending ? "false" : "true");
    {
      const metadata = payload
        ? publicRouteMetadata(payload)
        : {
            title: `${error ? "页面暂时无法加载" : "正在加载页面"} - ${SITE.title}`,
            description: error ?? "请稍候。",
            image: undefined,
          };
      const canonical = getCanonicalUrl(route?.path ?? "/404");
      const image = metadata.image ?? getCanonicalUrl(SITE.images.default);
      document.title = metadata.title;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", metadata.description);
      document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);
      for (const [selector, content] of [
        ['meta[property="og:title"]', metadata.title],
        ['meta[property="og:description"]', metadata.description],
        ['meta[property="og:url"]', canonical],
        ['meta[property="og:image"]', image],
        ['meta[name="twitter:title"]', metadata.title],
        ['meta[name="twitter:description"]', metadata.description],
        ['meta[name="twitter:image"]', image],
      ])
        document.querySelector(selector)?.setAttribute("content", content);
    }
    if (payload || error) document.dispatchEvent(new Event("astro:page-load"));
    if ((payload || error) && navigationStarted.current && pendingScroll.current) {
      let observer: MutationObserver | undefined;
      let resizeObserver: ResizeObserver | undefined;
      let frame = 0;
      let settleTimer: number | undefined;
      let stableChecks = 0;
      let stableGeometryChecks = 0;
      let previousMaxScrollTop: number | null = null;
      let restoreAttempts = 0;
      const restoreStartedAt = performance.now();
      const maxRestoreAttempts = 40;
      const maxRestoreDurationMs = 5_000;
      const scheduleRestore = () => {
        if (settleTimer !== undefined) {
          window.clearTimeout(settleTimer);
          settleTimer = undefined;
        }
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(restoreScroll);
      };
      const finishRestore = (persistPosition = false) => {
        pendingScroll.current = null;
        if (settleTimer !== undefined) window.clearTimeout(settleTimer);
        observer?.disconnect();
        resizeObserver?.disconnect();
        if (persistPosition) {
          window.history.replaceState(
            {
              ...window.history.state,
              publicCsrScroll: { top: window.scrollY, left: window.scrollX },
            },
            ""
          );
        }
      };
      const restoreScroll = () => {
        const scroll = pendingScroll.current;
        if (!scroll) return;
        const main = document.querySelector<HTMLElement>("main.nature-main");
        // MDX is route-specific and may resolve after the page DTO. Wait for
        // its real headings and height before restoring a fragment or history.
        if (main?.querySelector("[data-public-body-pending]")) {
          restoreAttempts += 1;
          if (
            performance.now() - restoreStartedAt < maxRestoreDurationMs &&
            restoreAttempts < maxRestoreAttempts
          ) {
            settleTimer = window.setTimeout(scheduleRestore, 120);
            return;
          }
          finishRestore();
          return;
        }
        main?.focus({ preventScroll: true });
        scroll.restorationAttempted = true;
        const hash = new URL(url, "https://public.invalid").hash;
        let anchor: HTMLElement | null = null;
        try {
          anchor = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
        } catch {
          /* Invalid fragment has no matching anchor. */
        }
        if (scroll.restore && scroll.position) {
          restoreAttempts += 1;
          const maxScrollTop = Math.max(
            0,
            document.documentElement.scrollHeight - (window.innerHeight || 0)
          );
          const maxScrollLeft = Math.max(
            0,
            document.documentElement.scrollWidth - (window.innerWidth || 0)
          );
          const targetTop = Math.min(Math.max(0, scroll.position.top), maxScrollTop);
          const targetLeft = Math.min(Math.max(0, scroll.position.left), maxScrollLeft);
          scroll.programmaticPosition = { top: targetTop, left: targetLeft };
          window.scrollTo({ top: targetTop, left: targetLeft, behavior: "instant" });
          const reachedTarget =
            Math.abs(window.scrollY - targetTop) <= 1 && Math.abs(window.scrollX - targetLeft) <= 1;
          const targetReachable = maxScrollTop >= scroll.position.top - 1;
          stableChecks = reachedTarget && targetReachable ? stableChecks + 1 : 0;
          stableGeometryChecks =
            previousMaxScrollTop === maxScrollTop ? stableGeometryChecks + 1 : 0;
          previousMaxScrollTop = maxScrollTop;
          // Virtualized rows can finish measuring several frames after the
          // route payload is ready. Keep enforcing the browser's saved
          // position across that settling window before releasing the guard.
          const settled = targetReachable
            ? stableChecks >= 12
            : reachedTarget && stableGeometryChecks >= 12;
          const timedOut =
            restoreAttempts >= maxRestoreAttempts ||
            performance.now() - restoreStartedAt >= maxRestoreDurationMs;
          if (!settled && !timedOut) {
            settleTimer = window.setTimeout(scheduleRestore, 120);
            return;
          }
          finishRestore(true);
          return;
        } else if (anchor) {
          anchor.scrollIntoView();
          scroll.programmaticPosition = { top: window.scrollY, left: window.scrollX };
        } else {
          scroll.programmaticPosition = { top: 0, left: 0 };
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
        finishRestore();
      };
      const main = document.querySelector<HTMLElement>("main.nature-main");
      if (main) {
        observer = new MutationObserver(scheduleRestore);
        observer.observe(main, { childList: true, subtree: true });
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(scheduleRestore);
          resizeObserver.observe(main);
        }
      }
      scheduleRestore();
      return () => {
        cancelAnimationFrame(frame);
        if (settleTimer !== undefined) window.clearTimeout(settleTimer);
        observer?.disconnect();
        resizeObserver?.disconnect();
      };
    }
  }, [payload, error, url, route?.path, scrollRevision]);

  return (
    <>
      <SiteHeader pathname={route?.path ?? "/404"} />
      <main
        className="nature-main"
        tabIndex={-1}
        data-public-route={route?.kind}
        aria-busy={!payload && !error && isAsyncPublicRouteKind(route?.kind)}
      >
        {payload ? (
          <Page
            key={publicRouteIdentity(new URL(url, "https://public.invalid"))}
            payload={payload}
            searchBootstrap={searchBootstrap}
          />
        ) : error ? (
          <PublicRouteError
            message={error}
            onRetry={() => navigateRef.current(new URL(window.location.href), "retry")}
          />
        ) : (
          <PublicRouteSkeleton kind={route?.kind} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
