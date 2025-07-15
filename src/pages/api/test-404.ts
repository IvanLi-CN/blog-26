import type { APIRoute } from 'astro';
import { create404Response } from '~/utils/error-handler';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  // 这个端点总是返回404，用于测试404处理
  return create404Response(request, 'Test 404 endpoint');
};
