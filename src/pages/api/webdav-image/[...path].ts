import type { APIRoute } from 'astro';
import { config } from '../../../lib/config';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const path = params.path;
    if (!path) {
      return new Response('Path is required', { status: 400 });
    }

    const webdavConfig = config.webdav;
    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      return new Response('WebDAV not configured', { status: 500 });
    }

    // 构建 WebDAV 图片 URL
    const imageUrl = `${webdavConfig.url}/${path}`;

    // 从 WebDAV 获取图片
    const response = await fetch(imageUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch image from WebDAV: ${response.status} ${response.statusText}`);
      return new Response('Image not found', { status: 404 });
    }

    // 获取图片数据和内容类型
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

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
