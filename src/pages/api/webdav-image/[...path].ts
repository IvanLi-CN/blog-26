import type { APIRoute } from 'astro';
import { createForbiddenResponse, isAdminRequest } from '../../../lib/auth-utils';
import { config } from '../../../lib/config';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    // 权限检查：只有管理员可以访问 WebDAV 图片
    const isAdmin = await isAdminRequest(request);
    if (!isAdmin) {
      console.warn('WebDAV image proxy: Unauthorized access attempt');
      return createForbiddenResponse('Admin access required');
    }

    const path = params.path;
    if (!path) {
      console.error('WebDAV image proxy: Path is required');
      return new Response('Path is required', { status: 400 });
    }

    const webdavConfig = config.webdav;
    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      console.error('WebDAV image proxy: WebDAV not configured');
      return new Response('WebDAV not configured', { status: 500 });
    }

    // 处理路径：确保正确拼接
    const cleanPath = Array.isArray(path) ? path.join('/') : path;
    // 解码 URL 编码的路径（处理中文字符）
    const decodedPath = decodeURIComponent(cleanPath);
    // 移除开头的斜杠，避免双斜杠
    let normalizedPath = decodedPath.replace(/^\/+/, '');

    // 特殊处理：如果路径只是文件名（没有目录），可能是闪念中的图片
    // 尝试在闪念的 assets 目录中查找
    if (!normalizedPath.includes('/') && normalizedPath.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      console.log(`WebDAV image proxy: Detected standalone image file: ${normalizedPath}`);
      // 先尝试在 Memos/assets 目录中查找
      const memosAssetsPath = `${webdavConfig.memosPath}/assets/${normalizedPath}`.replace(/^\/+/, '');
      console.log(`WebDAV image proxy: Trying memos assets path: ${memosAssetsPath}`);

      // 尝试访问闪念 assets 目录中的图片
      try {
        const encodedMemosPath = encodeURIComponent(memosAssetsPath);
        const memosImageUrl = `${webdavConfig.url}/${encodedMemosPath}`;
        console.log(`WebDAV image proxy: Trying URL: ${memosImageUrl}`);

        const memosResponse = await fetch(memosImageUrl, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')}`,
          },
        });

        if (memosResponse.ok) {
          console.log(`WebDAV image proxy: Found image in memos assets: ${memosImageUrl}`);
          const imageBuffer = await memosResponse.arrayBuffer();
          const contentType = memosResponse.headers.get('content-type') || 'image/jpeg';

          return new Response(imageBuffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch {
        console.log(`WebDAV image proxy: Failed to find in memos assets, trying original path`);
      }
    }

    // 重新编码路径以确保正确的 URL 格式
    const encodedPath = encodeURIComponent(normalizedPath);
    const imageUrl = `${webdavConfig.url}/${encodedPath}`;
    console.log(`WebDAV image proxy: Original path:`, path);
    console.log(`WebDAV image proxy: Clean path:`, cleanPath);
    console.log(`WebDAV image proxy: Decoded path:`, decodedPath);
    console.log(`WebDAV image proxy: Normalized path:`, normalizedPath);
    console.log(`WebDAV image proxy: Final URL:`, imageUrl);

    // 从 WebDAV 获取图片
    const response = await fetch(imageUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch image from WebDAV: ${response.status} ${response.statusText} for URL: ${imageUrl}`
      );
      return new Response('Image not found', { status: 404 });
    }

    // 获取图片数据和内容类型
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    console.log(
      `WebDAV image proxy: Successfully fetched image from path: ${path}, content-type: ${contentType}, size: ${imageBuffer.byteLength} bytes`
    );

    // 返回图片数据
    return new Response(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
      },
    });
  } catch (error) {
    console.error('Error proxying WebDAV image:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
