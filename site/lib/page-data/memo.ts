import { extractTextSummary, stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";
import { getMemoPresentation } from "@/lib/memo-presentation";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import { getMemoListWebDemoRecord } from "../memo-list-web-demo";
import { getCanonicalUrl, getMemoBySlug, getMemoMetadataTitle, getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { PublicRouteNotFound, trimRouteSnapshot } from "../route-data-utils";
export async function loadmemo(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const memoFromProps = (Astro.props as { memo?: PublicMemoRecord }).memo;
  const memo =
    memoFromProps ??
    (process.env.WEB_DEMO_BUILD === "true"
      ? getMemoListWebDemoRecord(Astro.params.slug ?? "")
      : getMemoBySlug(snapshot, Astro.params.slug ?? ""));
  if (!memo) throw new PublicRouteNotFound();
  const displayDate = memo.publishedAt ?? memo.createdAt;
  const metadataTitle = getMemoMetadataTitle(
    memo.title,
    displayDate,
    getMemoPresentation(memo).label
  );
  const contentSource = "local" as const;
  const publicMediaContext = { kind: "memo" as const, slug: memo.slug, filePath: memo.filePath };
  const memoDescription = extractTextSummary(memo.content, 180) || snapshot.site.description;
  const memoDetailContent = stripMatchingLeadingTitleHeading(memo.content, memo.title);
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
      "@id": getCanonicalUrl(`/memos/${memo.slug}`),
    },
  };
  return {
    snapshot: trimRouteSnapshot(snapshot, "memo", Astro.url.pathname),
    memoFromProps,
    memo,
    displayDate,
    metadataTitle,
    contentSource,
    publicMediaContext,
    memoDescription,
    memoDetailContent,
    clippingArticle: memo.clipping
      ? (snapshot.clippingArticles?.[memo.slug] ?? {
          reading: memo.clipping,
          source: null,
          translation: null,
        })
      : null,
    structuredData,
  };
}
