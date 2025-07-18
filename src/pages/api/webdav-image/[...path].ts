import type { APIRoute } from 'astro';
import { config } from '../../../lib/config';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
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
    // 移除开头的斜杠，避免双斜杠
    const normalizedPath = cleanPath.replace(/^\/+/, '');
    const imageUrl = `${webdavConfig.url}/${normalizedPath}`;
    console.log(`WebDAV image proxy: Original path:`, path);
    console.log(`WebDAV image proxy: Clean path:`, cleanPath);
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
