import { performRAGQuery } from '../../lib/rag';
import { initializeDB } from '../../lib/db'; // Import initializeDB
import type { APIRoute } from 'astro';

export const prerender = false

export const GET: APIRoute = async ({ url }: { url: URL }) => {
  try {
    console.log('Search API received URL:', url.toString()); // Added for debugging
    console.log('Search API searchParams:', url.searchParams); // Added for debugging
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
