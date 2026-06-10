import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import {
  buildPublicMediaAssetUrl,
  detectPublicMediaKind,
  type PublicMediaContext,
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
  } = options;

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
          }) ?? mediaPath
        );
      }

      return generateOptimizedImageUrl(resolveRelativePath(mediaPath, articleDir), contentSource);
    }

    visit(tree, "element", (node: Element) => {
      // 处理 img 标签
      if (node.tagName === "img" && node.properties && node.properties.src) {
        const originalSrc = node.properties.src as string;

        // 首先保存原始 src 用于灯箱功能（在任何处理之前）
        if (enableLightbox) {
          node.properties["data-original-src"] = originalSrc;
        }

        // 如果已经是完整的 URL、base64图片或已经是文件代理端点，跳过路径处理
        if (
          !isExternalUrl(originalSrc) &&
          !originalSrc.startsWith("data:") &&
          !originalSrc.startsWith("/api/files/")
        ) {
          const finalPath = buildFacadeOrOptimizedUrl(originalSrc, "content", "content");
          node.properties.src = finalPath;
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

        const mediaKind = href ? detectPublicMediaKind(href) : null;
        if (href && (isImagePath(href) || mediaKind === "video")) {
          // 如果已经是完整的 URL 或已经是文件代理端点，跳过处理
          if (!isExternalUrl(href) && !href.startsWith("/api/files/")) {
            const finalPath =
              mediaKind === "video"
                ? buildFacadeOrOptimizedUrl(href, "playback", "play")
                : buildFacadeOrOptimizedUrl(href, "content", "content");
            node.properties.href = finalPath;
          }
        }
      }

      if ((node.tagName === "video" || node.tagName === "source") && node.properties?.src) {
        const src = String(node.properties.src);
        if (!isExternalUrl(src) && !src.startsWith("/api/files/") && !src.startsWith("data:")) {
          node.properties.src = buildFacadeOrOptimizedUrl(src, "playback", "play");
        }
      }

      if (node.tagName === "video" && node.properties?.poster) {
        const poster = String(node.properties.poster);
        if (
          !isExternalUrl(poster) &&
          !poster.startsWith("/api/files/") &&
          !poster.startsWith("data:")
        ) {
          node.properties.poster = buildFacadeOrOptimizedUrl(poster, "content", "content");
        }
      }
    });
  };
}
