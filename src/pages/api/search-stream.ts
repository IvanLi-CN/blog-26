import type { APIRoute } from 'astro';
import { initializeDB } from '../../lib/db';
import { streamRAGQuery } from '../../lib/rag'; // 导入新的流式函数
import { rateLimiter, rateLimiterHourly } from '../../lib/rateLimiter';

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  try {
    // 1. 速率限制
    try {
      await rateLimiter.consume('global');
      await rateLimiterHourly.consume('global');
    } catch (rejRes) {
      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. 获取查询参数
    const query = url.searchParams.get('q');

    // 3. 验证输入参数
    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. 初始化数据库
    await initializeDB();

    // 5. 创建 SSE 流
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 获取流式查询的生成器
          const streamGenerator = streamRAGQuery(query);

          // 将每个数据块推送到流中
          for await (const chunk of streamGenerator) {
            controller.enqueue(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          }

          // 流结束
          controller.close();
        } catch (error) {
          console.error('SSE Stream error:', error);
          controller.error(error);
        }
      },
    });

    // 6. 返回流式响应
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Search Stream API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
