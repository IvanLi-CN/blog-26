import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const path = params.path;
    if (!path) {
      return new Response('Path is required', { status: 400 });
    }

    // 将旧的 /api/file/ 路径重定向到新的 /api/webdav-image/ 路径
    const cleanPath = Array.isArray(path) ? path.join('/') : path;
    // 对路径进行 URL 编码以处理中文字符
    const encodedPath = encodeURIComponent(cleanPath);
    const redirectUrl = `/api/webdav-image/${encodedPath}`;

    console.log(`Redirecting /api/file/${cleanPath} to ${redirectUrl}`);

    // 手动创建重定向响应以避免中文字符问题
    return new Response(null, {
      status: 301,
      headers: {
        Location: redirectUrl,
      },
    });
  } catch (error) {
    console.error('Error in file redirect:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
