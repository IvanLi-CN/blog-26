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
      // WebDAV文章的ID就是它的完整路径
      articlePath = file.data.astro.frontmatter.id;
      // 提取目录部分
      articleDir = articlePath.substring(0, articlePath.lastIndexOf('/') + 1);
    } else if (file.path) {
      articlePath = file.path;
      articleDir = articlePath.substring(0, articlePath.lastIndexOf('/') + 1);
    } else if (file.history && file.history.length > 0) {
      articlePath = file.history[0];
      articleDir = articlePath.substring(0, articlePath.lastIndexOf('/') + 1);
    }

    visit(tree, 'element', function (node) {
      if (node.tagName === 'img' && node.properties && node.properties.src) {
        const src = node.properties.src as string;

        // 如果已经是完整的 URL 或已经是 WebDAV API 路径，跳过处理
        if (
          src.startsWith('http://') ||
          src.startsWith('https://') ||
          src.startsWith('/api/webdav-image/') ||
          src.startsWith('~/assets/')
        ) {
          return;
        }

        // 根据文章的实际路径解析相对路径
        let resolvedPath = '';

        if (src.startsWith('./')) {
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

        // 转换为 WebDAV API 路径
        node.properties.src = `/api/webdav-image/${resolvedPath}`;
      }
    });
  };
};
