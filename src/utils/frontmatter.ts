import type { RehypePlugin, RemarkPlugin } from '@astrojs/markdown-remark';
import { toString as mdastToString } from 'mdast-util-to-string';
import getReadingTime from 'reading-time';
import { visit } from 'unist-util-visit';
import {
  generateOptimizedImageUrl,
  isExternalUrl,
  isImagePath,
  isOptimizedImageUrl,
  resolveRelativePath,
} from './path-resolver';

export const readingTimeRemarkPlugin: RemarkPlugin = () => {
  return function (tree, file) {
    const textOnPage = mdastToString(tree);
    const readingTime = Math.ceil(getReadingTime(textOnPage).minutes);

    if (file.data.astro?.frontmatter) {
      file.data.astro.frontmatter.readingTime = readingTime;
    }
  };
};

export const responsiveTablesRehypePlugin: RehypePlugin = () => {
  return function (tree) {
    if (!tree.children) return;

    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];

      if (child.type === 'element' && child.tagName === 'table') {
        tree.children[i] = {
          type: 'element',
          tagName: 'div',
          properties: {
            style: 'overflow:auto',
          },
          children: [child],
        };

        i++;
      }
    }
  };
};

export const lazyImagesRehypePlugin: RehypePlugin = () => {
  return function (tree) {
    if (!tree.children) return;

    visit(tree, 'element', function (node) {
      if (node.tagName === 'img') {
        node.properties.loading = 'lazy';
        // 添加图片全屏浏览功能的 class 和属性
        const existingClasses = Array.isArray(node.properties.className)
          ? node.properties.className
          : node.properties.className && typeof node.properties.className !== 'boolean'
            ? [String(node.properties.className)]
            : [];
        node.properties.className = [...existingClasses, 'content-image', 'cursor-pointer'];
        node.properties['data-lightbox'] = 'true';
        // 保存原始 src 用于全屏显示
        node.properties['data-original-src'] = node.properties.src;
      }
    });
  };
};

// WebDAV 图片路径转换插件
export const webdavImagesRehypePlugin: RehypePlugin = () => {
  return function (tree, file) {
    if (!tree.children) return;

    // 获取文章的原始路径信息
    let articlePath = '';
    let articleDir = '';

    // 从文件数据中获取文章路径
    if (file.data?.astro?.frontmatter?.id) {
      articlePath = file.data.astro.frontmatter.id;

      // WebDAV文章的ID是相对于WEBDAV_URL的路径，如 "/Project/ATX 取电转接板.md"
      // 我们需要提取目录部分，并移除前导斜杠，使其成为相对路径
      const rawDir = articlePath.substring(0, articlePath.lastIndexOf('/') + 1);
      articleDir = rawDir.startsWith('/') ? rawDir.substring(1) : rawDir;
    } else if (file.path) {
      articlePath = file.path;
      const rawDir = articlePath.substring(0, articlePath.lastIndexOf('/') + 1);
      articleDir = rawDir.startsWith('/') ? rawDir.substring(1) : rawDir;
    } else if (file.history && file.history.length > 0) {
      articlePath = file.history[0];
      const rawDir = articlePath.substring(0, articlePath.lastIndexOf('/') + 1);
      articleDir = rawDir.startsWith('/') ? rawDir.substring(1) : rawDir;
    }

    visit(tree, 'element', function (node) {
      // 处理 img 标签
      if (node.tagName === 'img' && node.properties && node.properties.src) {
        const src = node.properties.src as string;

        // 如果已经是完整的 URL、base64图片或已经是优化图片端点，跳过处理
        if (isExternalUrl(src) || src.startsWith('data:') || isOptimizedImageUrl(src)) {
          return;
        }

        // 根据文章的实际路径解析相对路径
        const resolvedPath = resolveRelativePath(src, articleDir);

        // 转换为优化图片端点，添加水印和优化
        const finalPath = generateOptimizedImageUrl(resolvedPath);
        node.properties.src = finalPath;
      }

      // 处理 a 标签中指向图片文件的链接
      if (node.tagName === 'a' && node.properties && node.properties.href) {
        const href = node.properties.href as string;
        // 检查是否是图片文件链接
        if (href && isImagePath(href)) {
          // 如果已经是完整的 URL 或已经是优化图片端点，跳过处理
          if (isExternalUrl(href) || isOptimizedImageUrl(href)) {
            return;
          }

          // 使用统一的路径解析逻辑
          const resolvedPath = resolveRelativePath(href, articleDir);
          const finalPath = generateOptimizedImageUrl(resolvedPath);
          node.properties.href = finalPath;
        }
      }
    });
  };
};
