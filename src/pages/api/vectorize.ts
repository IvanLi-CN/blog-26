import { processAndVectorizeAllContent } from '../../lib/vectorizer';
import type { VectorizationProgress } from '../../lib/vectorizer';

export const prerender = false;

export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendProgress = (progress: VectorizationProgress) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
      };

      try {
        console.log('触发向量化 API...');
        sendProgress({ stage: 'info', message: '向量化过程开始' });

        // 调用主向量化函数并传入进度回调
        await processAndVectorizeAllContent(sendProgress);

        console.log('向量化 API 完成.');
        sendProgress({ stage: 'done', message: '向量化过程成功完成' });
        controller.close();
      } catch (error) {
        console.error('向量化 API 过程出错:', error);
        const errorMessage = error instanceof Error ? error.message : '向量化 API 过程出错';
        sendProgress({ stage: 'error', message: errorMessage });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
