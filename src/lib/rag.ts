import { Buffer } from 'node:buffer';
import { type ChatMessage, Settings } from 'llamaindex';
import { fetchPosts } from '../utils/blog';
import { getCanonical } from '../utils/permalinks';
import { findSimilarFiles } from './db';
import { configureLlamaIndex } from './vectorizer';

export interface RAGSource {
  id: string; // filepath from DBRecord
  title: string;
  slug: string;
  permalink: string;
  score?: number; // from findSimilarFiles
}

export interface RAGResult {
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
        answer: '抱歉，我找不到相关信息来回答您的问题。',
        sources: [],
      };
    }

    // 获取所有文章，用于构建上下文和丰富来源信息
    console.log('Fetching all posts...');
    const posts = await fetchPosts();

    // 构建上下文
    console.log('Building context from similar documents...');
    let context = '';
    const contextPromises = similarDocs.map(async (record) => {
      const post = posts.find((p) => p.id === record.filepath);
      if (post && post.Content) {
        // Use the rendered content directly from the post object
        // post.Content is an Astro component factory, we need the rendered string content property (post.content)
        const content = post.content;

        const permalink = getCanonical(post?.permalink ?? '').toString();

        // Ensure content is a string, handle null/undefined return from post.content
        const safeContent = typeof content === 'string' ? content : String(content ?? '');

        return `Source: ${permalink}\n\n${safeContent}\n\n`;
      }
      console.warn(`Could not find post or content for record with filepath: ${record.filepath}`);
      return ''; // Skip records without a corresponding post or content
    });

    const contexts = await Promise.all(contextPromises);
    context = contexts.filter((c) => c !== '').join('---\n'); // Filter out empty contexts

    if (!context) {
      console.log('No context could be built from similar documents');
      return {
        answer: '抱歉，我找不到相关信息来回答您的问题。',
        sources: [],
      };
    }

    // 构建 prompt 并生成回答
    console.log('Generating answer...');
    const prompt = `请根据以下上下文，用中文回答问题。当你在回答中需要引用上下文中的来源时，必须使用来源中提供的完整 URL 链接（例如 'https://example.com/some-post'），而不是仅仅使用文章的标题或者 slug。请使用 Markdown 格式化你的回答，例如使用代码块包裹代码。

上下文:
${context}

问题: ${userQuery}

回答:`;

    const response = await Settings.llm.complete({ prompt });
    const answer = response.text;

    // 丰富来源信息
    console.log('Enriching source information...');
    const sources: RAGSource[] = similarDocs.map((record) => {
      const post = posts.find((p) => p.id === record.filepath);
      if (!post) {
        // Fallback if post not found (shouldn't happen if context was built)
        return {
          id: record.filepath,
          title: record.filepath,
          slug: record.filepath,
          permalink: `/${record.filepath}`,
          score: record.score,
        };
      }

      return {
        id: record.filepath,
        title: post.title,
        slug: post.slug,
        permalink: getCanonical(post.permalink).toString(),
        score: record.score,
      };
    });

    console.log('RAG query completed successfully');
    return {
      answer,
      sources,
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
export async function performChatQuery(
  message: string,
  history: { role: string; content: string }[]
): Promise<RAGResult> {
  try {
    console.log('performChatQuery called with message:', message, 'and history:', history);

    // 1. 验证输入参数
    if (!message) {
      throw new Error('User message cannot be empty.');
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
        answer: '抱歉，我找不到相关信息来回答您的问题。',
        sources: [],
      };
    }

    // 4. 构建上下文
    console.log('Building context from similar documents...');
    let context = '';
    const contextPromises = similarDocs.map(async (record) => {
      return `Source: ${record.filepath}\n\nThis is a placeholder content\n\n`; // Placeholder
    });

    const contexts = await Promise.all(contextPromises);
    context = contexts.filter((c) => c !== '').join('---\n'); // Filter out empty contexts

    if (!context) {
      console.log('No context could be built from similar documents');
      return {
        answer: '抱歉，我找不到相关信息来回答您的问题。',
        sources: [],
      };
    }

    // 5. 构建 prompt 并生成回答
    console.log('Generating answer...');
    const prompt = `请根据以下上下文和对话历史，用中文回答问题。

上下文:
${context}

问题: ${message}

回答:`;

    const response = await Settings.llm.complete({ prompt });
    const answer = response.text;

    // 6. 丰富来源信息
    console.log('Enriching source information...');
    const sources: RAGSource[] = similarDocs.map((record) => ({
      id: record.filepath,
      title: record.filepath, // Replace with actual title if available
      slug: record.filepath, // Replace with actual slug if available
      permalink: record.filepath, // Replace with actual permalink if available
      score: record.score,
    }));

    console.log('RAG query completed successfully');
    return {
      answer,
      sources,
    };
  } catch (error) {
    console.error('Error performing RAG query:', error);
    throw error;
  }
}

/**
 * 执行 AI 对话查询的流式版本
 * @param message 用户消息
 * @param history 对话历史
 * @returns 返回一个异步生成器，持续产生回答的文本片段
 */
export async function* streamChatQuery(
  message: string,
  history: { type: 'user' | 'ai'; text: string }[]
): AsyncGenerator<string> {
  try {
    console.log('streamChatQuery called with message:', message, 'and history:', history);

    // 1. 验证输入参数
    if (!message) {
      throw new Error('User message cannot be empty.');
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
      yield '抱歉，我找不到相关信息来回答您的问题。';
      return;
    }

    // 4. 获取所有文章用于构建上下文
    const posts = await fetchPosts();

    // 5. 构建上下文
    console.log('Building context from similar documents...');
    const contextPromises = similarDocs.map(async (record) => {
      const post = posts.find((p) => p.id === record.filepath);
      if (post && post.content) {
        const permalink = getCanonical(post.permalink ?? '').toString();
        const safeContent = typeof post.content === 'string' ? post.content : String(post.content ?? '');
        return `Source: ${permalink}\n\n${safeContent}\n\n`;
      }
      return '';
    });

    const contexts = await Promise.all(contextPromises);
    const context = contexts.filter((c) => c !== '').join('---\n');

    if (!context) {
      console.log('No context could be built from similar documents');
      yield '抱歉，我找不到相关信息来回答您的问题。';
      return;
    }

    // 6. 构建聊天消息
    const typedHistory: ChatMessage[] = history.map((msg) => ({
      role: msg.type === 'ai' ? 'assistant' : 'user',
      content: msg.text,
    }));

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `请根据以下上下文和对话历史，用中文回答问题。当你在回答中需要引用上下文中的来源时，必须使用来源中提供的完整 URL 链接（例如 'https://example.com/some-post'），而不是仅仅使用文章的标题或者 slug。请使用 Markdown 格式化你的回答，例如使用代码块包裹代码。\n\n上下文:\n${context}`,
      },
      ...typedHistory,
      {
        role: 'user',
        content: message,
      },
    ];

    // 7. 生成流式回答
    const responseStream = await Settings.llm.chat({ messages, stream: true });

    // 8. 返回流
    for await (const chunk of responseStream) {
      yield chunk.delta;
    }

    // 9. 构建并附加来源信息
    const sources: RAGSource[] = similarDocs.map((record) => {
      const post = posts.find((p) => p.id === record.filepath);
      return {
        id: record.filepath,
        title: post?.title ?? record.filepath,
        slug: post?.slug ?? record.filepath,
        permalink: post ? getCanonical(post.permalink).toString() : getCanonical(`/${record.filepath}`).toString(),
        score: record.score,
      };
    });

    // 在流末尾附加一个特殊标记和 JSON 数据
    const sourcesJson = JSON.stringify(sources);
    yield `\n\n__END_OF_STREAM__${sourcesJson}`;
  } catch (error) {
    console.error('Error performing streaming RAG query:', error);
    // 在流中抛出错误，以便上层可以捕获
    throw error;
  }
}
