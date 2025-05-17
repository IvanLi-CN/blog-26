import { processAndVectorizeAllContent } from '../../lib/vectorizer';

export async function GET() {
  try {
    console.log('触发向量化 API...');

    // 调用主向量化函数
    await processAndVectorizeAllContent();

    console.log('向量化 API 完成.');

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        message: '向量化过程已触发并完成。',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('向量化 API 过程出错:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : '向量化 API 过程出错',
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
