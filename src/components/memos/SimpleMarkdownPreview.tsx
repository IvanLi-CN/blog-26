import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { removeTagsFromContent } from '~/utils/utils';
import { isExternalUrl, resolveRelativePath } from '../../utils/path-resolver';

// 不需要重复导入样式，因为已经在 CustomStyles.astro 中全局导入了

interface SimpleMarkdownPreviewProps {
  content: string;
  removeTags?: boolean; // 是否移除标签，默认为 false
}

export function SimpleMarkdownPreview({ content, removeTags = false }: SimpleMarkdownPreviewProps) {
  if (!content.trim()) {
    return <div className="text-gray-500 italic text-center py-8">开始写作以查看预览...</div>;
  }

  // 如果需要移除标签，则处理内容
  let processedContent = removeTags ? removeTagsFromContent(content) : content;

  // 处理Milkdown编辑器输出的HTML转义问题
  // Milkdown有时会对markdown语法进行HTML转义，我们需要反转义
  processedContent = processedContent
    .replace(/\\#/g, '#') // 反转义标题
    .replace(/!\\\[/g, '![') // 反转义图片开始
    .replace(/\\\]/g, ']') // 反转义右方括号
    .replace(/\\\(/g, '(') // 反转义左圆括号
    .replace(/\\`/g, '`') // 反转义代码
    .replace(/\\\*/g, '*') // 反转义粗体/斜体
    .replace(/\\\_/g, '_') // 反转义下划线
    .replace(/<br\s*\/?>/gi, '\n\n'); // 将HTML换行转换为markdown换行

  // 预处理图片和链接URL，将包含空格或特殊字符的URL用尖括号包围
  // 这样markdown解析器就能正确识别它们（与parseMarkdownToHTML函数保持一致）
  processedContent = processedContent.replace(/(!?\[([^\]]*)\])\(([^)]+)\)/g, (match, linkPart, _altText, url) => {
    // 检查URL是否包含空格或特殊字符，且不是已经用尖括号包围的
    if (!url.startsWith('<') && !url.endsWith('>')) {
      // 检查是否包含空格、中文字符或其他需要编码的字符
      if (/[\s\u4e00-\u9fff@]/.test(url)) {
        return `${linkPart}(<${url}>)`;
      }
    }
    return match;
  });

  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={(url) => url}
        components={{
          // 自定义组件样式，适配闪念的紧凑布局
          h1: ({ children }) => <h1 className="text-xl font-bold mt-6 mb-3 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold mt-5 mb-2 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-medium mt-3 mb-1 first:mt-0">{children}</h5>,
          h6: ({ children }) => <h6 className="text-sm font-medium mt-3 mb-1 first:mt-0">{children}</h6>,
          p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside my-3 space-y-1 ml-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-3 space-y-1 ml-4">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 my-3">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return <code className="inline-code">{children}</code>;
            }
            // 对于代码块，完全依赖 highlight.js 的样式
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => <pre className="my-4">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="markdown-table">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="markdown-table-head">{children}</thead>,
          tbody: ({ children }) => <tbody className="markdown-table-body">{children}</tbody>,
          tr: ({ children }) => <tr className="markdown-table-row">{children}</tr>,
          th: ({ children }) => <th className="markdown-table-header">{children}</th>,
          td: ({ children }) => <td className="markdown-table-cell">{children}</td>,
          a: ({ children }) => (
            <span className="text-blue-600 dark:text-blue-400 underline cursor-default">{children}</span>
          ),
          img: ({ src, alt }) => {
            // 转换图片路径为优化后的图片路径
            let convertedSrc = src;
            // 如果是base64图片、HTTP/HTTPS URL或已经是render-image端点，直接使用
            if (src && !isExternalUrl(src) && !src.startsWith('data:') && !src.startsWith('/api/render-image/')) {
              // 对于Memos，使用统一的路径解析逻辑
              const articleDir = 'Memos/'; // Memos文章都在Memos目录下
              const resolvedPath = resolveRelativePath(src, articleDir);

              // 使用优化后的图片端点，指定尺寸和像素倍率
              convertedSrc = `/api/render-image/${resolvedPath}?f=webp&q=85&s=1200&dpr=1`;
            }
            return (
              <img
                src={convertedSrc}
                alt={alt}
                className="max-w-full h-auto rounded-md my-3"
                loading="lazy"
                onError={() => {
                  console.error('Image failed to load in SimpleMarkdownPreview:', {
                    originalSrc: src,
                    convertedSrc: convertedSrc,
                    alt: alt,
                  });
                }}
              />
            );
          },
          hr: () => <hr className="my-6 border-gray-300 dark:border-gray-600" />,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
