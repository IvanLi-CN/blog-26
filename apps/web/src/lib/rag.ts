import { Buffer } from 'node:buffer';
import { promises as fs } from 'fs';
import path from 'path';
import { Settings } from 'llamaindex';
import { configureLlamaIndex } from './vectorizer';
import { findSimilarFiles } from './db';
import { fetchPosts } from '../utils/blog';

interface RAGSource {
  id: string;      // filepath from DBRecord
  title: string;
  slug: string;
  permalink: string;
  score?: number;  // from findSimilarFiles
}

interface RAGResult {
  answer: string;
  sources: RAGSource[];
}

/**
 * 执行 RAG 查询，返回基于相关文档上下文的回答
 * @param userQuery 用户查询文本
 * @returns 包含答案和来源信息的 RAGResult
 */
export async function performRAGQuery(userQuery: string): Promise<RAGResult> {
  try {
    console.log('Starting RAG query:', userQuery);

    // 初始化 LlamaIndex
    configureLlamaIndex();

    // 向量化查询
    console.log('Vectorizing query...');
    const queryEmbedding = await Settings.embedModel.getTextEmbeddings([userQuery]);
    const queryVector = Buffer.from(new Float32Array(queryEmbedding[0]).buffer);

    // 获取相似文档
    console.log('Finding similar documents...');
    const similarDocs = await findSimilarFiles(queryVector, 3);

    if (similarDocs.length === 0) {
      console.log('No similar documents found');
      return {
        answer: "I couldn't find any relevant information to answer your question.",
        sources: []
      };
    }

    // 获取所有文章，用于构建上下文和丰富来源信息
    console.log('Fetching all posts...');
    const posts = await fetchPosts();

    // 构建上下文
    console.log('Building context from similar documents...');
    let context = '';
    const contextPromises = similarDocs.map(async (record) => {
      const post = posts.find(p => p.id === record.filepath);
      if (post && post.Content) {
        // Use the rendered content directly from the post object
        // post.Content is an Astro component factory, we need the rendered string content property (post.content)
        const content = post.content;

        const permalink = post?.permalink ?? '未知来源'; // Handle potential null/undefined permalink

        // Ensure content is a string, handle null/undefined return from post.content
        const safeContent = typeof content === 'string' ? content : String(content ?? '');

        return `Source: ${permalink}\n\n${safeContent}\n\n`;

      }
      console.warn(`Could not find post or content for record with filepath: ${record.filepath}`);
      return ''; // Skip records without a corresponding post or content
    });

    const contexts = await Promise.all(contextPromises);
    context = contexts.filter(c => c !== '').join('---\n'); // Filter out empty contexts

    if (!context) {
      console.log('No context could be built from similar documents');
      return {
        answer: "I couldn't find any relevant information to answer your question.",
        sources: []
      };
    }

    // 构建 prompt 并生成回答
    console.log('Generating answer...');
    const prompt = `Based on the following context, answer the query:

Context:
${context}

Query: ${userQuery}

Answer:`;

    const response = await Settings.llm.complete({ prompt });
    const answer = response.text;

    // 丰富来源信息
    console.log('Enriching source information...');
    const sources: RAGSource[] = similarDocs.map(record => {
      const post = posts.find(p => p.id === record.filepath);
      if (!post) {
        // Fallback if post not found (shouldn't happen if context was built)
        return {
          id: record.filepath,
          title: record.filepath,
          slug: record.filepath,
          permalink: `/${record.filepath}`,
          score: record.score
        };
      }

      return {
        id: record.filepath,
        title: post.title,
        slug: post.slug,
        permalink: post.permalink,
        score: record.score
      };
    });

    console.log('RAG query completed successfully');
    return {
      answer,
      sources
    };

  } catch (error) {
    console.error('Error performing RAG query:', error);
    throw error;
  }
}

/**
 * 执行 AI 对话查询，返回基于对话历史和用户消息的回答
 * @param message 用户消息
 * @param history 对话历史 (例如: { role: "user", content: "你好" }[])
 * @returns 包含答案和来源信息的 RAGResult
 */
export async function performChatQuery(message: string, history: { role: string; content: string }[]): Promise<RAGResult> {
  try {
    console.log('performChatQuery called with message:', message, 'and history:', history);

    // 1. 验证输入参数
    if (!message) {
      throw new Error("User message cannot be empty.");
    }
    // 初始化 LlamaIndex
    configureLlamaIndex();

    // 2. 向量化查询
    console.log('Vectorizing query...');
    const queryEmbedding = await Settings.embedModel.getTextEmbeddings([message]);
    const queryVector = Buffer.from(new Float32Array(queryEmbedding[0]).buffer);

    // 3. 获取相似文档
    console.log('Finding similar documents...');
    const similarDocs = await findSimilarFiles(queryVector, 3);

    if (similarDocs.length === 0) {
      console.log('No similar documents found');
      return {
        answer: "I couldn't find any relevant information to answer your question.",
        sources: []
      };
    }

    // 4. 构建上下文
    console.log('Building context from similar documents...');
    let context = '';
    const contextPromises = similarDocs.map(async (record) => {
      return `Source: ${record.filepath}\n\nThis is a placeholder content\n\n`; // Placeholder
    });

    const contexts = await Promise.all(contextPromises);
    context = contexts.filter(c => c !== '').join('---\n'); // Filter out empty contexts

    if (!context) {
      console.log('No context could be built from similar documents');
      return {
        answer: "I couldn't find any relevant information to answer your question.",
        sources: []
      };
    }

    // 5. 构建 prompt 并生成回答
    console.log('Generating answer...');
    const prompt = `Based on the following context, answer the query:\n\nContext:\n${context}\n\nQuery: ${message}\n\nAnswer:`;

    const response = await Settings.llm.complete({ prompt });
    const answer = response.text;

    // 6. 丰富来源信息
    console.log('Enriching source information...');
    const sources: RAGSource[] = similarDocs.map(record => ({
      id: record.filepath,
      title: record.filepath, // Replace with actual title if available
      slug: record.filepath, // Replace with actual slug if available
      permalink: record.filepath, // Replace with actual permalink if available
      score: record.score
    }));

    console.log('RAG query completed successfully');
    return {
      answer,
      sources
    };

  } catch (error) {
    console.error('Error performing RAG query:', error);
    throw error;
  }
}

// 定义 RAGResult 接口
interface RAGResult {
  answer: string;
  sources: RAGSource[];
}
