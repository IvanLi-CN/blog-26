import { calculateReadingTime, formatReadingTime } from "@/lib/reading-time";
import type { PublicPostRecord } from "@/public-site/snapshot";
import {
  appendPublicAssetVersion,
  getCanonicalUrl,
  getPostBySlug,
  getRelatedPosts,
  getSnapshot,
  toAbsoluteSiteUrl,
} from "../public-site";
import type { PageContext } from "../route-data-utils";
import { PublicRouteNotFound, postPreview, trimRouteSnapshot } from "../route-data-utils";
import { toPublicAssetUrl } from "../runtime-urls";
export async function loadpost(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const postFromProps = (Astro.props as { post?: PublicPostRecord }).post;
  const post = postFromProps ?? getPostBySlug(snapshot, Astro.params.slug ?? "");
  if (!post) throw new PublicRouteNotFound();
  const relatedPosts = getRelatedPosts(snapshot, post.slug).map(postPreview);
  const assetVersion = snapshot.generatedAt;
  const contentSource = "local" as const;
  const publicMediaContext = { kind: "post" as const, slug: post.slug, filePath: post.filePath };
  const imageSrc = appendPublicAssetVersion(
    post.media.cover?.variants.cover ?? toPublicAssetUrl(post.image),
    assetVersion
  );
  const absoluteImageSrc = imageSrc
    ? imageSrc.startsWith("http") || imageSrc.startsWith("data:")
      ? imageSrc
      : toAbsoluteSiteUrl(imageSrc)
    : undefined;
  const readingTime = formatReadingTime(calculateReadingTime(post.body || ""));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    datePublished: post.publishDate,
    dateModified: post.updateDate ?? post.publishDate,
    author: {
      "@type": "Person",
      name: post.author || snapshot.site.author.name,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": getCanonicalUrl(`/posts/${post.slug}`),
    },
    image: absoluteImageSrc,
  };
  return {
    snapshot: trimRouteSnapshot(snapshot, "post", Astro.url.pathname),
    postFromProps,
    post,
    relatedPosts,
    assetVersion,
    contentSource,
    publicMediaContext,
    imageSrc,
    absoluteImageSrc,
    readingTime,
    structuredData,
  };
}
