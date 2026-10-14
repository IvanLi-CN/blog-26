import type { ConsoleWebDemoPublicMemo } from "@/lib/console-web-demo";
import {
  getConsoleWebDemoClippingArticle,
  getConsoleWebDemoMemo,
  getConsoleWebDemoPersona,
} from "@/lib/console-web-demo";
import { extractTextSummary, stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";
import { getMemoPresentation } from "@/lib/memo-presentation";
import { createEmptyPublicMediaCollection } from "@/lib/public-media";
import { resolveRuntimeContext } from "@/lib/runtime-context";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import { getMemoListWebDemoRecord } from "../memo-list-web-demo";
import { getCanonicalUrl, getMemoBySlug, getMemoMetadataTitle, getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { PublicRouteNotFound, trimRouteSnapshot } from "../route-data-utils";

type ConsoleMemoRecord = PublicMemoRecord & {
  canDiscuss?: boolean;
  authoredContent?: string;
  authoredTitle?: string;
  source?: string;
};

function normalizeMemoForRender(
  memo: PublicMemoRecord | ConsoleWebDemoPublicMemo
): PublicMemoRecord {
  if ("filePath" in memo && "media" in memo && "dataSource" in memo) {
    return memo;
  }
  return {
    ...memo,
    dataSource: null,
    filePath: "",
    media: createEmptyPublicMediaCollection(),
  };
}

type ConsoleClippingArticle = {
  reading: NonNullable<ConsoleMemoRecord["clipping"]>;
  source: string | null;
  translation: string | null;
  content?: string;
  title?: string | null;
  canDiscuss?: boolean;
  processorEnabled?: boolean;
};

async function loadConsoleMemo(Astro: PageContext, slug: string) {
  if (process.env.CONSOLE_RUNTIME !== "true") return null;
  if (resolveRuntimeContext(Astro.request).mode !== "console") return null;

  if (process.env.CONSOLE_WEB_DEMO_BUILD === "true") {
    const persona = getConsoleWebDemoPersona(Astro.url);
    if (persona !== "admin") return null;
    const memo = getConsoleWebDemoMemo(slug, persona);
    if (!memo) throw new PublicRouteNotFound();
    return {
      memo,
      isAdmin: true,
      clippingArticle: memo.clipping ? getConsoleWebDemoClippingArticle(slug, persona) : null,
    };
  }

  const [{ extractAuthFromRequest }, { handlePublicApiRequest }] = await Promise.all([
    import("@/lib/auth-utils"),
    import("@/server/public-api/router"),
  ]);
  const auth = await extractAuthFromRequest(Astro.request);
  if (!auth.isAdmin) return null;
  const encodedSlug = encodeURIComponent(slug);
  const headers = new Headers(Astro.request.headers);
  headers.delete("x-admin-preview");
  if (auth.isAdmin) headers.set("x-admin-preview", "1");

  const memoRequest = new Request(new URL(`/api/public/memos/${encodedSlug}`, Astro.request.url), {
    method: "GET",
    headers,
  });
  const memoResponse = await handlePublicApiRequest(memoRequest, `/memos/${encodedSlug}`);
  if (memoResponse.status === 403 || memoResponse.status === 404) {
    throw new PublicRouteNotFound();
  }
  if (!memoResponse.ok) throw new Error("Memo 详情暂时不可用。");
  const rawMemo = (await memoResponse.json()) as ConsoleMemoRecord;
  const memo = {
    ...rawMemo,
    filePath: rawMemo.filePath || rawMemo.slug,
  };

  let clippingArticle: ConsoleClippingArticle | null = null;
  if (memo.clipping) {
    const clippingRequest = new Request(
      new URL(`/api/public/memos/${encodedSlug}/clipping`, Astro.request.url),
      { method: "GET", headers }
    );
    const clippingResponse = await handlePublicApiRequest(
      clippingRequest,
      `/memos/${encodedSlug}/clipping`
    );
    if (clippingResponse.ok) {
      clippingArticle = (await clippingResponse.json()) as ConsoleClippingArticle;
    }
  }

  return { memo, isAdmin: auth.isAdmin, clippingArticle };
}

export async function loadmemo(Astro: PageContext) {
  const isConsoleWebDemo = process.env.CONSOLE_WEB_DEMO_BUILD === "true";
  const memoFromProps = isConsoleWebDemo
    ? undefined
    : (Astro.props as { memo?: PublicMemoRecord }).memo;
  const consoleMemo = await loadConsoleMemo(Astro, Astro.params.slug ?? "");
  const snapshot = await getSnapshot();
  const consoleWebDemoMemo = isConsoleWebDemo
    ? getConsoleWebDemoMemo(Astro.params.slug ?? "", getConsoleWebDemoPersona(Astro.url))
    : null;
  const memo =
    consoleWebDemoMemo ??
    consoleMemo?.memo ??
    memoFromProps ??
    (process.env.WEB_DEMO_BUILD === "true"
      ? getMemoListWebDemoRecord(Astro.params.slug ?? "")
      : getMemoBySlug(snapshot, Astro.params.slug ?? ""));
  if (!memo) throw new PublicRouteNotFound();
  const renderMemo = normalizeMemoForRender(memo);
  const displayDate = renderMemo.publishedAt ?? renderMemo.createdAt;
  const metadataTitle = getMemoMetadataTitle(
    renderMemo.title,
    displayDate,
    getMemoPresentation(renderMemo).label
  );
  const contentSource = "local" as const;
  const publicMediaContext = {
    kind: "memo" as const,
    slug: renderMemo.slug,
    filePath: renderMemo.filePath,
    ...(consoleMemo?.isAdmin ? { assetScope: "admin-preview" as const } : {}),
  };
  const memoDescription = extractTextSummary(renderMemo.content, 180) || snapshot.site.description;
  const memoDetailContent = stripMatchingLeadingTitleHeading(renderMemo.content, renderMemo.title);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: metadataTitle,
    description: memoDescription,
    datePublished: displayDate,
    dateModified: memo.updatedAt ?? displayDate,
    author: {
      "@type": "Person",
      name: snapshot.site.author.name,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": getCanonicalUrl(`/memos/${renderMemo.slug}`),
    },
  };
  return {
    snapshot: trimRouteSnapshot(snapshot, "memo", Astro.url.pathname),
    memoFromProps,
    memo: renderMemo,
    initialMemo: consoleMemo?.isAdmin ? consoleMemo.memo : undefined,
    initialIsAdmin: consoleMemo?.isAdmin ?? false,
    displayDate,
    metadataTitle,
    contentSource,
    publicMediaContext,
    memoDescription,
    memoDetailContent,
    clippingArticle: renderMemo.clipping
      ? (consoleMemo?.clippingArticle ??
        snapshot.clippingArticles?.[renderMemo.slug] ?? {
          reading: renderMemo.clipping,
          source: null,
          translation: null,
        })
      : null,
    structuredData,
  };
}
