import { performChatQuery } from '../../lib/rag';
import { initializeDB } from '../../lib/db';
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. 解析请求体
    const body = await request.json();
    const { query, history } = body; // 将 message 替换为 query

    // 2. 验证输入参数
    if (!query || !history || !Array.isArray(history)) { // 将 message 替换为 query
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid parameters',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 3. 初始化数据库
    await initializeDB();

    // 4. 调用 RAG 函数 (使用 performChatQuery)
    const result = await performChatQuery(query, history); // 传递 query 和 history

    // 5. 构建 JSON 响应
    const responseData = {
      text: result.answer,
      sources: result.sources,
    };

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Chat API error:', error);
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
};
