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
import { rehypeCollapsibleCode } from './rehype-collapsible-code';

/**
 * 解析 Markdown 内容为 HTML
 * 使用与 Astro 配置相同的插件来保持一致性
 */
export async function parseMarkdownToHTML(markdown: string, articlePath?: string): Promise<string> {
  // 处理Milkdown编辑器输出的HTML转义问题
  // Milkdown有时会对markdown语法进行HTML转义，我们需要反转义
  let processedMarkdown = markdown
    .replace(/\\#/g, '#') // 反转义标题
    .replace(/!\\\[/g, '![') // 反转义图片开始
    .replace(/\\\]/g, ']') // 反转义右方括号
    .replace(/\\\(/g, '(') // 反转义左圆括号
    .replace(/\\`/g, '`') // 反转义代码
    .replace(/\\\*/g, '*') // 反转义粗体/斜体
    .replace(/\\\_/g, '_') // 反转义下划线
    .replace(/<br\s*\/?>/gi, '\n\n'); // 将HTML换行转换为markdown换行

  // 预处理图片和链接URL，将包含空格或特殊字符的URL用尖括号包围
  // 这样markdown解析器就能正确识别它们
  processedMarkdown = processedMarkdown.replace(/(!?\[([^\]]*)\])\(([^)]+)\)/g, (match, linkPart, _altText, url) => {
    // 检查URL是否包含空格或特殊字符，且不是已经用尖括号包围的
    if (!url.startsWith('<') && !url.endsWith('>')) {
      // 检查是否包含空格、中文字符或其他需要编码的字符
      if (/[\s\u4e00-\u9fff@]/.test(url)) {
        return `${linkPart}(<${url}>)`;
      }
    }
    return match;
  });

  // 创建一个虚拟文件对象
  const vfile = {
    value: processedMarkdown,
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
    .use(webdavImagesRehypePlugin)
    .use(lazyImagesRehypePlugin)
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
    .use(rehypeCollapsibleCode, {
      maxLines: 30,
      previewLines: 20,
    })
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
