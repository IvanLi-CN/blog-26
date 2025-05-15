import { Buffer } from 'node:buffer';
import { Settings, OpenAIEmbedding, OpenAI } from 'llamaindex';

import { initializeDB, getAllFileRecords, upsertFileRecord, deleteFileRecord } from './db';
import type { DBRecord } from './db';
import { processAllContent } from './contentProcessor';
import type { ProcessedContent } from './contentProcessor';
import { getCollection } from 'astro:content';

/**
 * 配置 LlamaIndex 的环境和模型设置
 */
export function configureLlamaIndex(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;

  if (!apiKey || !baseURL) {
    console.error('Missing required environment variables:', {
      OPENAI_API_KEY: apiKey ? 'set' : 'missing',
      OPENAI_API_BASE_URL: baseURL ? 'set' : 'missing'
    });
    throw new Error('Missing required environment variables');
  }

  // 配置 embedding 模型
  Settings.embedModel = new OpenAIEmbedding({
    model: "text-embedding-3-small",
    apiKey,
    baseURL,
  });

  // 配置 LLM 模型
  Settings.llm = new OpenAI({
    model: "o4-mini",
    apiKey,
    baseURL,
  });

  console.log('LlamaIndex 配置已初始化');
}

/**
 * 处理所有内容文件，进行增量向量化
 */
export async function processAndVectorizeAllContent(): Promise<void> {
  console.log('开始向量化内容...');
  configureLlamaIndex();
  await initializeDB();

  // 1. 获取所有当前内容文件的 ID
  const allPosts = await getCollection('post');
  const currentFilepaths = new Set(allPosts.map(post => post.id));
  console.log(`找到 ${currentFilepaths.size} 篇当前文章.`);

  // 2. 获取需要更新或新增的内容
  const contentToVectorize = await processAllContent();
  console.log(`需要向量化 ${contentToVectorize.length} 篇文章.`);

  // 3. 向量化并更新/插入数据库
  for (const item of contentToVectorize) {
    try {
      console.log(`正在向量化: ${item.filepath}`);
      // LlamaIndex getTextEmbeddings expects an array of strings
      const embeddings = await Settings.embedModel.getTextEmbeddings([item.rawContent]);
      const vector = Buffer.from(new Float32Array(embeddings[0]).buffer); // Convert Float32Array to Buffer

      const record: DBRecord = {
        filepath: item.filepath,
        slug: item.slug, // Include slug from ProcessedContent
        contentHash: item.contentHash,
        lastModifiedTime: item.lastModified,
        contentUpdatedAt: item.effectiveContentUpdatedAt, // Include effectiveContentUpdatedAt
        indexedAt: Date.now(),
        vector: vector,
      };
      await upsertFileRecord(record);
      console.log(`成功向量化并更新: ${item.filepath}`);
    } catch (error) {
      console.error(`向量化失败: ${item.filepath}`, error);
    }
  }

  // 4. 删除数据库中不再存在的内容
  const existingRecords = await getAllFileRecords();
  console.log(`数据库中共有 ${existingRecords.length} 条记录.`);

  for (const record of existingRecords) {
    if (!currentFilepaths.has(record.filepath)) {
      try {
        console.log(`正在删除不再存在的记录: ${record.filepath}`);
        await deleteFileRecord(record.filepath);
        console.log(`成功删除记录: ${record.filepath}`);
      } catch (error) {
        console.error(`删除记录失败: ${record.filepath}`, error);
      }
    }
  }

  console.log('内容向量化完成.');
  // Note: We don't close the DB here as it might be used by the API route later in hybrid mode.
  // The script execution will handle process exit.
}
