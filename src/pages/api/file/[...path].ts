import type { APIRoute } from 'astro';
import { createForbiddenResponse, isAdminRequest } from '../../../lib/auth-utils';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    // 权限检查：只有管理员可以访问文件重定向
    const isAdmin = await isAdminRequest(request);
    if (!isAdmin) {
      console.warn('File API redirect: Unauthorized access attempt');
      return createForbiddenResponse('Admin access required');
    }

    const path = params.path;
    if (!path) {
      return new Response('Path is required', { status: 400 });
    }

    // 将 /api/file/ 路径重定向到新的 /api/webdav-image/ 路径
    const cleanPath = Array.isArray(path) ? path.join('/') : path;

    // 对于中文字符，不需要在这里编码，让 webdav-image 端点处理
    const redirectUrl = `/api/webdav-image/${cleanPath}`;

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
