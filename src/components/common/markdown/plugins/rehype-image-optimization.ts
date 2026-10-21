import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import {
  buildPublicAssetPath,
  buildPublicMediaAssetUrl,
  buildPublicMediaPresentations,
  detectPublicMediaKind,
  isPublicAssetFacadeUrl,
  isPublicContentKind,
  isPublicMediaRenderId,
  isPublicMediaVariant,
  isPublishedPublicAssetUrl,
  isStaticPublicAssetUrl,
  type PublicMediaContext,
  type PublicMediaPresentations,
  type PublicMediaRenderId,
} from "@/lib/public-media";
import type { ImageOptimizationOptions } from "../types";
import {
  generateOptimizedImageUrl,
  isExternalUrl,
  isImagePath,
  resolveRelativePath,
} from "../utils";

/**
 * Rehype 插件：图片优化和路径转换
 *
 * 此插件会：
 * 1. 转换相对路径图片为优化端点
 * 2. 添加懒加载属性
 * 3. 添加灯箱功能的属性
 * 4. 处理图片链接
 */
export function rehypeImageOptimization(options: ImageOptimizationOptions = {}) {
  const {
    enableLazyLoading = true,
    enableLightbox = true,
    articlePath = "",
    contentSource = "local",
    publicMediaContext,
    publicAssetVersion,
    mapContentUrl,
  } = options;

  function appendPublicAssetVersion(url: string, version: string | null | undefined) {
    if (!version || !url.includes("/api/public/assets/")) return url;
    try {
      const parsed = new URL(url, "https://public.invalid");
      parsed.searchParams.set("v", version);
      return url.startsWith("/")
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : parsed.toString();
    } catch {
      return url;
    }
  }

  function mapUrl(url: string) {
    return mapContentUrl ? mapContentUrl(url) : url;
  }

  function mapSrcSet(value: string) {
    return value
      .split(",")
      .map((candidate) => {
        const match = /^\s*(?:<([^>]+)>|(\S+))(\s+.+?)?\s*$/u.exec(candidate);
        const url = match?.[1] ?? match?.[2];
        if (!url) return candidate;
        const mapped = mapUrl(url);
        return `${mapped}${match?.[3] ?? ""}`;
      })
      .join(", ");
  }

  return (tree: Root, file: unknown) => {
    // 获取文章的原始路径信息
    let resolvedArticlePath = articlePath;
    let articleDir = "";

    // 从文件数据中获取文章路径
    const fileData = file as {
      data?: { astro?: { frontmatter?: { id?: string } } };
      path?: string;
      history?: string[];
    };
    if (!resolvedArticlePath && fileData?.data?.astro?.frontmatter?.id) {
      resolvedArticlePath = fileData.data.astro.frontmatter.id;
    } else if (!resolvedArticlePath && fileData?.path) {
      resolvedArticlePath = fileData.path;
    } else if (!resolvedArticlePath && fileData?.history && fileData.history.length > 0) {
      resolvedArticlePath = fileData.history[0];
    }

    // 提取目录部分
    if (resolvedArticlePath) {
      const rawDir = resolvedArticlePath.substring(0, resolvedArticlePath.lastIndexOf("/") + 1);
      articleDir = rawDir.startsWith("/") ? rawDir.substring(1) : rawDir;
    }

    function buildFacadeOrOptimizedUrl(
      mediaPath: string,
      role: "content" | "playback",
      variant: "content" | "play"
    ) {
      if (publicMediaContext) {
        return (
          buildPublicMediaAssetUrl({
            context: publicMediaContext as PublicMediaContext,
            mediaPath,
            role,
            variant,
            renderId: publicMediaContext.supportsResponsiveWatermark === false ? null : undefined,
          }) ?? mediaPath
        );
      }

      return generateOptimizedImageUrl(resolveRelativePath(mediaPath, articleDir), contentSource);
    }

    function buildPresentationsFromVersionedFacadeUrl(
      mediaPath: string,
      targetVariant: "content" | "full"
    ): PublicMediaPresentations | null {
      if (
        !publicMediaContext ||
        publicMediaContext.supportsResponsiveWatermark === false ||
        (!isPublicAssetFacadeUrl(mediaPath) && !isStaticPublicAssetUrl(mediaPath))
      )
        return null;

      let parsed: URL;
      try {
        parsed = new URL(mediaPath, "https://public.invalid");
      } catch {
        return null;
      }

      const match =
        /^(\/api\/public\/assets|\/_content\/assets)\/(post|memo)\/([^/]+)\/([^/]+)\/(wm-[ab]-v[123])\/(card|cover|content|full|social|poster)\.([a-z0-9]+)$/iu.exec(
          parsed.pathname
        );
      if (!match) return null;

      const [, assetPrefix, kind, encodedSlug, mediaHash, renderId, sourceVariant, ext] = match;
      if (
        !isPublicContentKind(kind) ||
        !isPublicMediaRenderId(renderId) ||
        !isPublicMediaVariant(sourceVariant) ||
        kind !== publicMediaContext.kind ||
        decodeURIComponent(encodedSlug) !== publicMediaContext.slug
      ) {
        return null;
      }

      const candidateRenderIds: [PublicMediaRenderId, PublicMediaRenderId] = renderId.endsWith(
        "-v3"
      )
        ? ["wm-a-v3", "wm-b-v3"]
        : renderId.endsWith("-v2")
          ? ["wm-a-v2", "wm-b-v2"]
          : ["wm-a-v1", "wm-b-v1"];
      const buildCandidate = (candidateRenderId: (typeof candidateRenderIds)[number]) => {
        if (assetPrefix === "/_content/assets") {
          return `${assetPrefix}/${kind}/${encodedSlug}/${mediaHash}/${candidateRenderId}/${targetVariant}.${ext}${parsed.search}`;
        }

        return buildPublicAssetPath({
          scope: publicMediaContext.assetScope,
          kind,
          slug: publicMediaContext.slug,
          mediaHash,
          renderId: candidateRenderId,
          variant: targetVariant,
          ext,
        });
      };

      return { a: buildCandidate(candidateRenderIds[0]), b: buildCandidate(candidateRenderIds[1]) };
    }

    visit(tree, "element", (node: Element) => {
      // 处理 img 标签
      if (node.tagName === "img" && node.properties && node.properties.src) {
        const originalSrc = node.properties.src as string;
        const mappedOriginalSrc = mapUrl(originalSrc);
        const hasMappedContentUrl = mappedOriginalSrc !== originalSrc;
        const shouldRewrite =
          !hasMappedContentUrl &&
          !isExternalUrl(originalSrc) &&
          !originalSrc.startsWith("data:") &&
          !isPublishedPublicAssetUrl(originalSrc);
        const rewrittenSrc = appendPublicAssetVersion(
          hasMappedContentUrl
            ? mappedOriginalSrc
            : shouldRewrite
              ? buildFacadeOrOptimizedUrl(originalSrc, "content", "content")
              : originalSrc,
          publicAssetVersion
        );
        const mappedSrc = mapUrl(rewrittenSrc);

        // 首先保存原始 src 用于灯箱功能（在任何处理之前）
        if (enableLightbox) {
          node.properties["data-original-src"] = mappedSrc;
        }

        if (publicMediaContext && !hasMappedContentUrl) {
          const inlinePresentations = shouldRewrite
            ? publicMediaContext.supportsResponsiveWatermark === false
              ? null
              : buildPublicMediaPresentations({
                  context: publicMediaContext,
                  mediaPath: originalSrc,
                  role: "content",
                  variant: "content",
                })
            : buildPresentationsFromVersionedFacadeUrl(originalSrc, "content");
          const fullPresentations = shouldRewrite
            ? publicMediaContext.supportsResponsiveWatermark === false
              ? null
              : buildPublicMediaPresentations({
                  context: publicMediaContext,
                  mediaPath: originalSrc,
                  role: "content",
                  variant: "full",
                })
            : buildPresentationsFromVersionedFacadeUrl(originalSrc, "full");
          if (inlinePresentations) {
            node.properties["data-watermark-a"] = appendPublicAssetVersion(
              inlinePresentations.a,
              publicAssetVersion
            );
            node.properties["data-watermark-b"] = appendPublicAssetVersion(
              inlinePresentations.b,
              publicAssetVersion
            );
          }
          if (fullPresentations) {
            node.properties["data-watermark-full-a"] = appendPublicAssetVersion(
              fullPresentations.a,
              publicAssetVersion
            );
            node.properties["data-watermark-full-b"] = appendPublicAssetVersion(
              fullPresentations.b,
              publicAssetVersion
            );
          }
          node.properties["data-watermark-fallback"] = "b";
        }

        if (shouldRewrite || hasMappedContentUrl) {
          node.properties.src = mappedSrc;
        }

        // 添加懒加载
        if (enableLazyLoading) {
          node.properties.loading = "lazy";
        }

        // 添加图片全屏浏览功能的 class 和属性
        if (enableLightbox) {
          const existingClasses = Array.isArray(node.properties.className)
            ? node.properties.className
            : node.properties.className && typeof node.properties.className !== "boolean"
              ? [String(node.properties.className)]
              : [];

          node.properties.className = [...existingClasses, "content-image", "cursor-pointer"];
          node.properties["data-lightbox"] = "true";
        }
      }

      // 处理 a 标签中指向图片文件的链接
      if (node.tagName === "a" && node.properties && node.properties.href) {
        const href = node.properties.href as string;
        const mappedHref = mapUrl(href);

        const mediaKind = href ? detectPublicMediaKind(href) : null;
        if (mappedHref !== href) {
          node.properties.href = mappedHref;
        } else if (href && (isImagePath(href) || mediaKind === "video")) {
          if (!isExternalUrl(href) && !isPublishedPublicAssetUrl(href)) {
            const finalPath =
              mediaKind === "video"
                ? buildFacadeOrOptimizedUrl(href, "playback", "play")
                : buildFacadeOrOptimizedUrl(href, "content", "content");
            node.properties.href = appendPublicAssetVersion(finalPath, publicAssetVersion);
          }
        }
      }

      if (
        (node.tagName === "video" || node.tagName === "audio" || node.tagName === "source") &&
        node.properties?.src
      ) {
        const src = String(node.properties.src);
        const mappedSrc = mapUrl(src);
        if (mappedSrc !== src) {
          node.properties.src = mappedSrc;
        } else if (
          !isExternalUrl(src) &&
          !isPublishedPublicAssetUrl(src) &&
          !src.startsWith("data:")
        ) {
          node.properties.src = mapUrl(
            appendPublicAssetVersion(
              buildFacadeOrOptimizedUrl(src, "playback", "play"),
              publicAssetVersion
            )
          );
        }
      }

      if (typeof node.properties?.srcSet === "string")
        node.properties.srcSet = mapSrcSet(node.properties.srcSet);
      if (typeof node.properties?.srcset === "string")
        node.properties.srcset = mapSrcSet(node.properties.srcset);

      if (node.tagName === "video" && node.properties?.poster) {
        const poster = String(node.properties.poster);
        const mappedPoster = mapUrl(poster);
        const hasMappedPoster = mappedPoster !== poster;
        if (publicMediaContext && !hasMappedPoster) {
          const posterPresentations =
            publicMediaContext.supportsResponsiveWatermark === false
              ? null
              : !isPublishedPublicAssetUrl(poster)
                ? buildPublicMediaPresentations({
                    context: publicMediaContext,
                    mediaPath: poster,
                    role: "content",
                    variant: "content",
                  })
                : buildPresentationsFromVersionedFacadeUrl(poster, "content");
          if (posterPresentations) {
            node.properties["data-watermark-poster-a"] = appendPublicAssetVersion(
              posterPresentations.a,
              publicAssetVersion
            );
            node.properties["data-watermark-poster-b"] = appendPublicAssetVersion(
              posterPresentations.b,
              publicAssetVersion
            );
          }
        }
        if (hasMappedPoster) {
          node.properties.poster = mappedPoster;
        } else if (
          !isExternalUrl(poster) &&
          !isPublishedPublicAssetUrl(poster) &&
          !poster.startsWith("data:")
        ) {
          node.properties.poster = mapUrl(
            appendPublicAssetVersion(
              buildFacadeOrOptimizedUrl(poster, "content", "content"),
              publicAssetVersion
            )
          );
        }
      }
    });
  };
}
