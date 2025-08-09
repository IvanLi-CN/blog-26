import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { removeTagsFromContent } from '~/utils/utils';
import { isExternalUrl, resolveRelativePath } from '../../utils/path-resolver';
import { CollapsibleCodeBlock } from './CollapsibleCodeBlock';

interface MarkdownRendererProps {
  content: string;
  removeTags?: boolean;
  className?: string;
  /** 折叠模式：list（列表页，紧凑）或 detail（详情页，宽松） */
  variant?: 'list' | 'detail';
  /** 自定义最大行数，会覆盖 variant 的默认值 */
  maxLines?: number;
  /** 自定义预览行数，会覆盖 variant 的默认值 */
  previewLines?: number;
}

export default function MarkdownRenderer({
  content,
  removeTags = false,
  className = 'prose prose-sm md:prose-base max-w-none text-sm md:text-base',
  variant = 'list',
  maxLines,
  previewLines,
}: MarkdownRendererProps) {
  if (!content.trim()) {
    return <div className="text-gray-500 italic text-center py-8">暂无内容</div>;
  }

  // 根据 variant 计算折叠参数
  const getCollapseConfig = () => {
    if (maxLines !== undefined && previewLines !== undefined) {
      // 如果明确指定了参数，使用指定值
      return { maxLines, previewLines };
    }

    // 根据 variant 使用预设值
    switch (variant) {
      case 'detail':
        return {
          maxLines: maxLines ?? 30,
          previewLines: previewLines ?? 20,
        };
      case 'list':
      default:
        return {
          maxLines: maxLines ?? 10,
          previewLines: previewLines ?? 7,
        };
    }
  };

  const collapseConfig = getCollapseConfig();

  // 如果需要移除标签，则处理内容
  let processedContent = removeTags ? removeTagsFromContent(content) : content;

  // 处理Milkdown编辑器输出的HTML转义问题
  processedContent = processedContent
    .replace(/\\#/g, '#') // 反转义标题
    .replace(/!\\\[/g, '![') // 反转义图片开始
    .replace(/\\\]/g, ']') // 反转义右方括号
    .replace(/\\\(/g, '(') // 反转义左圆括号
    .replace(/\\`/g, '`') // 反转义代码
    .replace(/\\\*/g, '*') // 反转义粗体/斜体
    .replace(/\\\_/g, '_') // 反转义下划线
    .replace(/<br\s*\/?>/gi, '\n\n'); // 将HTML换行转换为markdown换行

  // 预处理图片和链接URL
  processedContent = processedContent.replace(/(!?\[([^\]]*)\])\(([^)]+)\)/g, (match, linkPart, _altText, url) => {
    if (!url.startsWith('<') && !url.endsWith('>')) {
      if (/[\s\u4e00-\u9fff@]/.test(url)) {
        return `${linkPart}(<${url}>)`;
      }
    }
    return match;
  });

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={(url) => url}
        components={{
          // 自定义组件样式
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
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => {
            // 递归提取文本内容的辅助函数
            const extractTextContent = (node: any): string => {
              if (typeof node === 'string') {
                return node;
              }
              if (typeof node === 'number') {
                return String(node);
              }
              if (Array.isArray(node)) {
                return node.map(extractTextContent).join('');
              }
              if (node && typeof node === 'object') {
                if ('props' in node && node.props && 'children' in node.props) {
                  return extractTextContent(node.props.children);
                }
                if ('children' in node) {
                  return extractTextContent(node.children);
                }
              }
              return '';
            };

            // 提取代码内容和语言信息
            const codeElement = Array.isArray(children) ? children[0] : children;
            if (codeElement && typeof codeElement === 'object' && 'props' in codeElement) {
              const { className = '', children: codeContent } = codeElement.props;

              // 使用递归函数提取代码文本
              const codeText = extractTextContent(codeContent);

              if (codeText.trim()) {
                return (
                  <CollapsibleCodeBlock
                    className={className}
                    maxLines={collapseConfig.maxLines}
                    previewLines={collapseConfig.previewLines}
                  >
                    {codeText}
                  </CollapsibleCodeBlock>
                );
              }
            }

            // 如果无法从 code 元素中提取内容，尝试直接从 children 提取
            const directText = extractTextContent(children);
            if (directText.trim()) {
              return (
                <CollapsibleCodeBlock
                  className=""
                  maxLines={collapseConfig.maxLines}
                  previewLines={collapseConfig.previewLines}
                >
                  {directText}
                </CollapsibleCodeBlock>
              );
            }

            // 降级处理
            return <pre className="my-4">{children}</pre>;
          },
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
            if (src && !isExternalUrl(src) && !src.startsWith('data:') && !src.startsWith('/api/render-image/')) {
              const articleDir = 'Memos/';
              const resolvedPath = resolveRelativePath(src, articleDir);
              convertedSrc = `/api/render-image/${resolvedPath}?f=webp&q=85&s=1200&dpr=1`;
            }
            return (
              <img
                src={convertedSrc}
                alt={alt}
                className="max-w-full h-auto rounded-md my-3"
                loading="lazy"
                onError={() => {
                  console.error('Image failed to load in MarkdownRenderer:', {
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
