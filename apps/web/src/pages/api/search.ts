import type { APIRoute } from 'astro';
import { initializeDB } from '../../lib/db'; // Import initializeDB
import { performRAGQuery } from '../../lib/rag';
import { rateLimiter, rateLimiterHourly } from '../../lib/rateLimiter'; // 导入 rateLimiter

export const prerender = false

export const GET: APIRoute = async ({ url }: { url: URL }) => {
  try {
    // 1. 速率限制
    try {
      await rateLimiter.consume('global');
      await rateLimiterHourly.consume('global');
    } catch (rejRes) {
      return new Response(
        JSON.stringify({
          error: 'Too Many Requests',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 获取查询参数
    const query = url.searchParams.get('q');
    console.log('Search API received query:', query); // Added for debugging
    console.log('Type of received query:', typeof query); // Added for debugging

    // 验证查询参数
    if (!query) {
      console.error('Query is missing or empty in API'); // Added for debugging
      return new Response(
        JSON.stringify({
          error: 'Missing query parameter', // Keep original error message for frontend
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 初始化数据库
    await initializeDB(); // Initialize the database

    // 执行 RAG 查询
    const result = await performRAGQuery(query);

    // 返回结果
    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Search API error:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
