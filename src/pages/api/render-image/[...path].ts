import type { APIRoute } from 'astro';
import crypto from 'crypto';
import { config } from '../../../lib/config';
import { isSupportedImageFormat, optimizeImage } from '../../../lib/image-optimizer';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, url }) => {
  try {
    const path = params.path;
    if (!path) {
      return new Response('Path is required', { status: 400 });
    }

    const webdavConfig = config.webdav;
    if (!webdavConfig.url) {
      return new Response('WebDAV not configured', { status: 500 });
    }

    // 处理路径
    const cleanPath = Array.isArray(path) ? path.join('/') : path;
    const decodedPath = decodeURIComponent(cleanPath);
    let normalizedPath = decodedPath.replace(/^\/+/, '');

    // 检查是否为支持的图片格式
    if (!isSupportedImageFormat(normalizedPath)) {
      return new Response('Unsupported image format', { status: 400 });
    }

    // 从查询参数获取优化选项
    const searchParams = url.searchParams;
    const size = searchParams.get('s') ? parseInt(searchParams.get('s')!) : undefined; // 单一尺寸参数
    const quality = searchParams.get('q') ? parseInt(searchParams.get('q')!) : 85;
    const format = (searchParams.get('f') as 'webp' | 'jpeg' | 'png') || 'webp';
    const noWatermark = searchParams.get('no-watermark') === 'true';
    const keepMetadata = searchParams.get('keep-metadata') === 'true';
    const pixelRatio = searchParams.get('dpr') ? parseFloat(searchParams.get('dpr')!) : 1; // 显示倍率，默认1x

    // 特殊处理：处理闪念相关的图片路径
    if (normalizedPath.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      const cleanMemosPath = webdavConfig.memosPath.replace(/^\/+/, '');
      let possiblePaths: string[] = [];

      if (normalizedPath.startsWith('assets/')) {
        // 对于 assets/ 开头的路径，尝试在 Memos 目录中查找
        possiblePaths = [
          `${cleanMemosPath}/${normalizedPath}`, // Memos/assets/...
          normalizedPath, // 直接使用原路径
        ];
      } else if (!normalizedPath.includes('/')) {
        // 如果路径只是文件名，尝试在闪念的 assets 目录中查找
        possiblePaths = [`${cleanMemosPath}/assets/${normalizedPath}`, normalizedPath];
      }

      let foundPath: string | null = null;
      if (possiblePaths.length > 0) {
        for (const testPath of possiblePaths) {
          try {
            const testUrl = `${webdavConfig.url}/${testPath}`;
            const testHeaders: Record<string, string> = {};

            // 只有在提供了用户名和密码时才添加认证头
            if (webdavConfig.username && webdavConfig.password) {
              testHeaders.Authorization = `Basic ${btoa(`${webdavConfig.username}:${webdavConfig.password}`)}`;
            }

            const testResponse = await fetch(testUrl, {
              method: 'HEAD',
              headers: testHeaders,
            });
            if (testResponse.ok) {
              foundPath = testPath;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (foundPath) {
        normalizedPath = foundPath;
      }
    }

    // 从 WebDAV 获取原始图片
    const webdavUrl = `${webdavConfig.url}/${normalizedPath}`;
    const headers: Record<string, string> = {};

    // 只有在提供了用户名和密码时才添加认证头
    if (webdavConfig.username && webdavConfig.password) {
      headers.Authorization = `Basic ${btoa(`${webdavConfig.username}:${webdavConfig.password}`)}`;
    }

    const response = await fetch(webdavUrl, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return new Response('Image not found', { status: 404 });
      }
      return new Response(`Failed to fetch image: ${response.statusText}`, { status: response.status });
    }

    // 获取原始图片数据
    const originalBuffer = Buffer.from(await response.arrayBuffer());

    // 优化图片
    const optimizedResult = await optimizeImage(originalBuffer, {
      size,
      quality,
      format,
      addWatermark: !noWatermark,
      removeMetadata: !keepMetadata,
      pixelRatio,
    });

    // 生成更强的缓存键，包含文件修改时间和优化参数
    const lastModified = response.headers.get('last-modified') || new Date().toISOString();
    const cacheKey = `${normalizedPath}-${size}-${quality}-${format}-${pixelRatio}-${!noWatermark}-${lastModified}`;
    const etag = `"${crypto.createHash('md5').update(cacheKey).digest('hex')}"`;

    // 设置缓存头
    const cacheHeaders = {
      'Cache-Control': 'public, max-age=31536000, immutable', // 1年缓存
      ETag: etag,
      'Last-Modified': lastModified,
      Vary: 'Accept-Encoding',
    };

    // 检查 ETag 和 If-Modified-Since
    const ifNoneMatch = request.headers.get('if-none-match');
    const ifModifiedSince = request.headers.get('if-modified-since');

    if (ifNoneMatch === etag || (ifModifiedSince && new Date(ifModifiedSince) >= new Date(lastModified))) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }

    // 返回优化后的图片
    return new Response(
      optimizedResult.buffer.buffer.slice(
        optimizedResult.buffer.byteOffset,
        optimizedResult.buffer.byteOffset + optimizedResult.buffer.byteLength
      ) as ArrayBuffer,
      {
        status: 200,
        headers: {
          'Content-Type': `image/${optimizedResult.format}`,
          'Content-Length': optimizedResult.size.toString(),
          'X-Image-Width': optimizedResult.width.toString(),
          'X-Image-Height': optimizedResult.height.toString(),
          'X-Original-Size': originalBuffer.length.toString(),
          'X-Optimized-Size': optimizedResult.size.toString(),
          'X-Compression-Ratio': ((1 - optimizedResult.size / originalBuffer.length) * 100).toFixed(2),
          ...cacheHeaders,
        },
      }
    );
  } catch (error) {
    console.error('Error in image rendering optimization:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
