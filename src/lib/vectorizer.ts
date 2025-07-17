import { Buffer } from 'node:buffer';
import { OpenAI, OpenAIEmbedding } from '@llamaindex/openai';
import { Document, Settings, SimpleNodeParser } from 'llamaindex';
import { processAllContent } from './contentProcessor';
import type { DBRecord } from './db';
import { deleteFileRecord, getAllFileRecords, initializeDB, upsertFileRecord } from './db';

export type VectorizationProgress = {
  stage: 'vectorizing' | 'deleting' | 'done' | 'error' | 'info';
  message: string;
  total?: number;
  current?: number;
  percentage?: number;
};

/**
 * 配置 LlamaIndex 的环境和模型设置
 */
export function configureLlamaIndex(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;

  // 从环境变量中读取模型配置，并提供默认值
  const embeddingModelName = process.env.EMBEDDING_MODEL_NAME ?? 'text-embedding-3-small';
  const embeddingDimension = process.env.EMBEDDING_DIMENSION
    ? Number.parseInt(process.env.EMBEDDING_DIMENSION, 10)
    : 1536;
  const chatModelName = process.env.CHAT_MODEL_NAME ?? 'deepseek-v3';

  if (!apiKey || !baseURL) {
    console.error('Missing required environment variables:', {
      OPENAI_API_KEY: apiKey ? 'set' : 'missing',
      OPENAI_API_BASE_URL: baseURL ? 'set' : 'missing',
    });
    throw new Error('Missing required environment variables');
  }

  // 配置 embedding 模型
  Settings.embedModel = new OpenAIEmbedding({
    model: embeddingModelName,
    dimensions: embeddingDimension,
    apiKey,
    baseURL,
  });

  // 配置 LLM 模型
  Settings.llm = new OpenAI({
    model: chatModelName,
    apiKey,
    baseURL,
  });

  console.log('LlamaIndex Configuration Initialized:', {
    embeddingModelName,
    embeddingDimension,
    chatModelName,
  });
}

/**
 * 处理所有内容文件，进行增量向量化
 */
export async function processAndVectorizeAllContent(
  onProgress?: (progress: VectorizationProgress) => void
): Promise<void> {
  onProgress?.({ stage: 'info', message: '开始向量化内容...' });
  console.log('开始向量化内容...');
  configureLlamaIndex();
  await initializeDB();

  const embeddingModelName = process.env.EMBEDDING_MODEL_NAME ?? 'text-embedding-3-small';

  // 检查现有记录的模型是否与当前配置一致
  const existingRecords = await getAllFileRecords();
  if (existingRecords.length > 0) {
    const firstRecordModel = existingRecords[0].modelName;
    if (firstRecordModel !== embeddingModelName) {
      const message = `模型配置已更改 (之前: ${firstRecordModel}, 当前: ${embeddingModelName}). 将重新向量化所有内容.`;
      onProgress?.({ stage: 'info', message });
      console.warn(message);
      for (const record of existingRecords) {
        await deleteFileRecord(record.filepath);
      }
    }
  }

  // 1. 获取所有需要处理的文件及所有有效的文件路径
  const { filesToProcess, allFilepaths } = await processAllContent();
  const totalToVectorize = filesToProcess.length;
  const totalFiles = allFilepaths.size;
  const message1 = `找到 ${totalFiles} 篇文章，其中 ${totalToVectorize} 篇需要处理。`;
  onProgress?.({ stage: 'info', message: message1, total: totalFiles, current: 0 });
  console.log(message1);

  // 2. 向量化并更新/插入数据库
  let vectorizedCount = 0;
  for (const item of filesToProcess) {
    vectorizedCount++;
    const percentage = totalToVectorize > 0 ? Math.round((vectorizedCount / totalToVectorize) * 100) : 0;
    try {
      const message = `正在向量化: ${item.filepath}`;
      onProgress?.({
        stage: 'vectorizing',
        message,
        total: totalToVectorize,
        current: vectorizedCount,
        percentage,
      });
      console.log(message);

      const document = new Document({ text: item.rawContent });
      const nodeParser = new SimpleNodeParser({
        chunkSize: 4096, // Use a more conservative chunk size
        chunkOverlap: 200,
      });
      const nodes = nodeParser.getNodesFromDocuments([document]);
      const textChunks = nodes.map((node) => node.getText());

      const embeddings = await Settings.embedModel.getTextEmbeddings(textChunks);

      const averageVector = new Float32Array(embeddings[0].length).fill(0);
      for (const embedding of embeddings) {
        for (let i = 0; i < embedding.length; i++) {
          averageVector[i] += embedding[i];
        }
      }
      for (let i = 0; i < averageVector.length; i++) {
        averageVector[i] /= embeddings.length;
      }

      const vector = Buffer.from(averageVector.buffer);

      const record: DBRecord = {
        filepath: item.filepath,
        slug: item.slug,
        contentHash: item.contentHash,
        lastModifiedTime: item.lastModified,
        contentUpdatedAt: item.effectiveContentUpdatedAt,
        indexedAt: Date.now(),
        modelName: embeddingModelName,
        vector: vector,
      };
      await upsertFileRecord(record);
      console.log(`成功向量化并更新: ${item.filepath}`);
    } catch (error) {
      const errorMessage = `向量化失败: ${item.filepath}. 原因: ${error instanceof Error ? error.message : String(error)}`;
      onProgress?.({
        stage: 'error',
        message: errorMessage,
        total: totalToVectorize,
        current: vectorizedCount,
        percentage,
      });
      console.error(`向量化失败: ${item.filepath}`, error);
    }
  }

  // 4. 删除数据库中不再存在的内容
  const freshExistingRecords = await getAllFileRecords(); // Re-fetch to get the most current state
  const message3 = `数据库中共有 ${freshExistingRecords.length} 条记录.`;
  onProgress?.({ stage: 'info', message: message3 });
  console.log(message3);

  const recordsToDelete = freshExistingRecords.filter((record) => !allFilepaths.has(record.filepath));
  const totalToDelete = recordsToDelete.length;
  let deletedCount = 0;

  for (const record of recordsToDelete) {
    deletedCount++;
    const percentage = totalToDelete > 0 ? Math.round((deletedCount / totalToDelete) * 100) : 0;
    try {
      const message = `正在删除不再存在的记录: ${record.filepath}`;
      onProgress?.({
        stage: 'deleting',
        message,
        total: totalToDelete,
        current: deletedCount,
        percentage,
      });
      console.log(message);
      await deleteFileRecord(record.filepath);
      console.log(`成功删除记录: ${record.filepath}`);
    } catch (error) {
      const errorMessage = `删除记录失败: ${record.filepath}`;
      onProgress?.({
        stage: 'error',
        message: errorMessage,
        total: totalToDelete,
        current: deletedCount,
        percentage,
      });
      console.error(errorMessage, error);
    }
  }

  const finalMessage = '内容向量化完成.';
  onProgress?.({ stage: 'done', message: finalMessage });
  console.log(finalMessage);
  // Note: We don't close the DB here as it might be used by the API route later in hybrid mode.
  // The script execution will handle process exit.
}
