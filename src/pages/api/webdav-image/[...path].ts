import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    // 重定向到新的 /files/ 端点
    const path = params.path;
    if (!path) {
      return new Response('Path is required', { status: 400 });
    }

    // 将 /api/webdav-image/ 路径重定向到 /files/ 路径
    const cleanPath = Array.isArray(path) ? path.join('/') : path;
    const redirectUrl = `/files/${cleanPath}`;

    console.log(`Redirecting /api/webdav-image/${cleanPath} to ${redirectUrl}`);

    return new Response(null, {
      status: 301,
      headers: {
        Location: redirectUrl,
      },
    });
  } catch (error) {
    console.error('Error in webdav-image redirect:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
