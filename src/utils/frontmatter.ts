import type { RehypePlugin, RemarkPlugin } from '@astrojs/markdown-remark';
import { toString as mdastToString } from 'mdast-util-to-string';
import getReadingTime from 'reading-time';
import { visit } from 'unist-util-visit';

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

        // 如果已经是完整的 URL 或已经是优化图片端点，跳过处理
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/api/render-image/')) {
          return;
        }

        // 根据文章的实际路径解析相对路径
        let resolvedPath = '';

        if (src.startsWith('~/assets/')) {
          // 处理 ~/assets/ 路径，这些可能是WebDAV上的资源
          // 移除 ~/assets/ 前缀，然后根据文章路径解析
          const assetPath = src.substring(9); // 移除 '~/assets/'
          resolvedPath = `${articleDir}assets/${assetPath}`;
        } else if (src.startsWith('./')) {
          // 相对于文章目录的路径
          resolvedPath = `${articleDir}${src.substring(2)}`;
        } else if (src.startsWith('../')) {
          // 相对于上级目录的路径
          // 计算上级目录
          const parts = articleDir.split('/').filter(Boolean);
          let upCount = 0;
          let srcParts = src.split('/');

          // 计算上级目录的数量
          while (srcParts.length > 0 && srcParts[0] === '..') {
            upCount++;
            srcParts.shift();
          }

          // 构建新路径
          const newDirParts = parts.slice(0, Math.max(0, parts.length - upCount));
          resolvedPath = `${newDirParts.join('/')}/${srcParts.join('/')}`;
        } else if (src.startsWith('/')) {
          // 绝对路径（相对于WebDAV根目录）
          resolvedPath = src.substring(1);
        } else {
          // 没有前缀的相对路径，视为相对于文章目录
          resolvedPath = `${articleDir}${src}`;
        }

        // 清理路径（移除多余的斜杠等）
        resolvedPath = resolvedPath.replace(/\/+/g, '/').replace(/^\//, '');

        // 转换为优化图片端点，添加水印和优化
        const finalPath = `/api/render-image/${resolvedPath}?f=webp&q=85&s=1200&dpr=1`;
        node.properties.src = finalPath;
      }

      // 处理 a 标签中指向图片文件的链接
      if (node.tagName === 'a' && node.properties && node.properties.href) {
        const href = node.properties.href as string;
        // 检查是否是图片文件链接
        if (href && /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i.test(href)) {
          // 如果已经是完整的 URL 或已经是优化图片端点，跳过处理
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/api/render-image/')) {
            return;
          }

          // 使用相同的路径解析逻辑
          let resolvedPath = '';

          if (href.startsWith('~/assets/')) {
            const assetPath = href.substring(9);
            resolvedPath = `${articleDir}assets/${assetPath}`;
          } else if (href.startsWith('./')) {
            resolvedPath = `${articleDir}${href.substring(2)}`;
          } else if (href.startsWith('../')) {
            const parts = articleDir.split('/').filter(Boolean);
            let upCount = 0;
            let srcParts = href.split('/');

            while (srcParts.length > 0 && srcParts[0] === '..') {
              upCount++;
              srcParts.shift();
            }

            const newDirParts = parts.slice(0, Math.max(0, parts.length - upCount));
            resolvedPath = `${newDirParts.join('/')}/${srcParts.join('/')}`;
          } else if (href.startsWith('/')) {
            resolvedPath = href.substring(1);
          } else {
            resolvedPath = `${articleDir}${href}`;
          }

          resolvedPath = resolvedPath.replace(/\/+/g, '/').replace(/^\//, '');
          const finalPath = `/api/render-image/${resolvedPath}?f=webp&q=85&s=1200&dpr=1`;
          node.properties.href = finalPath;
        }
      }
    });
  };
};
