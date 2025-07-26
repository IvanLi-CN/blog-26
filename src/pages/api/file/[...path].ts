import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    // 移除权限检查：图片访问应该是公开的
    // 图片资源不需要权限控制，任何人都可以访问

    const path = params.path;
    if (!path) {
      return new Response('Path is required', { status: 400 });
    }

    // 将 /api/file/ 路径重定向到 /files/ 路径
    const cleanPath = Array.isArray(path) ? path.join('/') : path;
    const redirectUrl = `/files/${cleanPath}`;

    console.log(`Redirecting /api/file/${cleanPath} to ${redirectUrl}`);

    // 手动创建重定向响应以避免中文字符问题
    return new Response(null, {
      status: 301,
      headers: {
        Location: redirectUrl,
      },
    });
  } catch (error) {
    console.error('Error in file API redirect:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
