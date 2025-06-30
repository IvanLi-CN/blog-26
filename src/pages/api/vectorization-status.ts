import type { APIRoute } from 'astro';
import { config } from '~/lib/config';
import { getAllFileRecords, initializeDB } from '~/lib/db';

export const prerender = false;

export type VectorizationStatus = {
  slug: string;
  status: 'correct' | 'mismatch' | 'notvectorized';
};

export const GET: APIRoute = async ({ request }) => {
  try {
    await initializeDB();

    const { modelName } = config.embedding;
    const { dimension: modelDimension } = config.embedding;

    if (!modelName || !modelDimension) {
      console.error('Embedding model environment variables are not set.');
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), { status: 500 });
    }

    // 解析查询参数
    const url = new URL(request.url);
    const requestedSlugs = url.searchParams.getAll('slugs');

    const records = await getAllFileRecords();

    // 如果指定了 slugs 参数，只返回这些文章的状态
    const filteredRecords =
      requestedSlugs.length > 0 ? records.filter((record) => requestedSlugs.includes(record.slug)) : records;

    const statusObject: Record<string, string> = {};

    // 处理存在的记录
    filteredRecords.forEach((record) => {
      const dimension = record.vector ? (record.vector as Buffer).length / 4 : 0;
      if (record.modelName === modelName && dimension === modelDimension) {
        statusObject[record.slug] = 'correct';
      } else {
        statusObject[record.slug] = 'mismatch';
      }
    });

    // 对于请求的但不存在的 slugs，返回 notvectorized 状态
    if (requestedSlugs.length > 0) {
      const existingSlugs = filteredRecords.map((r) => r.slug);
      const missingSlugs = requestedSlugs.filter((slug) => !existingSlugs.includes(slug));

      missingSlugs.forEach((slug) => {
        statusObject[slug] = 'notvectorized';
      });
    }

    return new Response(JSON.stringify(statusObject), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error fetching vectorization status:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch vectorization status.' }), { status: 500 });
  }
};
