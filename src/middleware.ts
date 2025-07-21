import { defineMiddleware } from 'astro:middleware';
import { isAdminFromRequest } from './lib/auth';
import { create404Response, isHtmlAccepted } from './utils/error-handler';

export const onRequest = defineMiddleware(async (context, next) => {
  // 检查用户是否为管理员并设置到 locals
  const isUserAdmin = await isAdminFromRequest(context.cookies, context.request.headers);

  context.locals.isAdmin = isUserAdmin;

  // 如果是管理员，设置 ADMIN_MODE 环境变量
  if (isUserAdmin) {
    process.env.ADMIN_MODE = 'true';
  }
  try {
    // 继续处理请求
    const response = await next();

    // 如果响应状态是404，根据用户代理返回适当的响应
    if (response.status === 404) {
      const request = context.request;

      // 对于任何404响应，都直接返回404内容，不做重定向
      return create404Response(request, 'Page not found');
    }

    return response;
  } catch (error) {
    console.error('Middleware error:', error);

    // 如果发生错误，也根据用户代理返回适当的响应
    const request = context.request;
    if (!isHtmlAccepted(request)) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          status: 500,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 对于HTML请求，让Astro处理错误
    throw error;
  }
});
