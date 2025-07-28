import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeMermaid from 'rehype-mermaid';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import {
  lazyImagesRehypePlugin,
  readingTimeRemarkPlugin,
  responsiveTablesRehypePlugin,
  webdavImagesRehypePlugin,
} from './frontmatter';

/**
 * 解析 Markdown 内容为 HTML
 * 使用与 Astro 配置相同的插件来保持一致性
 */
export async function parseMarkdownToHTML(markdown: string, articlePath?: string): Promise<string> {
  // 创建一个虚拟文件对象
  const vfile = {
    value: markdown,
    data: {} as any,
  };

  // 如果提供了文章路径，将其添加到文件数据中
  if (articlePath) {
    vfile.data.astro = {
      frontmatter: {
        id: articlePath,
      },
    };
  }

  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(readingTimeRemarkPlugin)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(responsiveTablesRehypePlugin)
    .use(lazyImagesRehypePlugin)
    .use(webdavImagesRehypePlugin)
    .use(rehypeKatex, {
      strict: 'ignore', // 忽略严格模式警告
      throwOnError: false, // 遇到错误时不抛出异常
    } as any)
    .use(rehypeMermaid as any, {
      strategy: 'img-svg',
      dark: true,
      // 添加错误处理和超时配置
      launchOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        timeout: 60000,
        headless: true,
      },
      // 添加错误处理回调
      errorFallback: (_element: any, diagram: string, error: Error) => {
        console.warn('Mermaid rendering error:', error.message);
        console.warn('Diagram content:', diagram);
        // 返回一个简单的代码块而不是 null
        return {
          type: 'element',
          tagName: 'pre',
          properties: { className: ['mermaid-error'] },
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: diagram }],
            },
          ],
        };
      },
    })
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const result = await processor.process(vfile);
  return String(result);
}

/**
 * 计算 Markdown 内容的阅读时间
 */
export function calculateReadingTime(markdown: string): number {
  // 简单的阅读时间计算：假设每分钟阅读 200 个单词
  const wordsPerMinute = 200;
  const words = markdown.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

/**
 * 从 Markdown 内容中提取第一个标题（优先H1，备选H2）
 */
export function extractFirstH1Title(markdown: string): string | null {
  // 优先匹配H1标题：# 标题
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // 如果没有H1，尝试匹配H2标题：## 标题
  const h2Match = markdown.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }

  return null;
}

/**
 * 清理标题用作文件名
 * 只保留字母数字、中文字符、空格和连字符，空格替换为下划线，限制50字符
 */
export function cleanTitleForFilename(title: string): string {
  // 只保留字母数字、中文字符、空格和连字符
  const cleaned = title.replace(/[^\w\u4e00-\u9fa5\s\-]/g, '');
  // 空格替换为下划线
  const withUnderscores = cleaned.replace(/\s+/g, '_');
  // 限制50字符
  return withUnderscores.substring(0, 50);
}
