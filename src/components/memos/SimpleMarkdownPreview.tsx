import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { removeTagsFromContent } from '~/utils/utils';

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
  const processedContent = removeTags ? removeTagsFromContent(content) : content;

  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
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
          a: ({ children, href }) => (
            <span className="text-blue-600 dark:text-blue-400 underline cursor-default">{children}</span>
          ),
          img: ({ src, alt }) => {
            // 转换图片路径为文件代理路径
            let convertedSrc = src;
            if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('/files/')) {
              let cleanPath = src;

              // 处理相对路径 - 相对于闪念文件位置 (/Memos/)
              let targetPath = cleanPath;

              if (targetPath.startsWith('./assets/')) {
                // ./assets/file.png -> Memos/assets/file.png
                targetPath = `Memos/${targetPath.substring(2)}`;
              } else if (targetPath.startsWith('assets/')) {
                // assets/file.png -> Memos/assets/file.png
                targetPath = `Memos/${targetPath}`;
              } else if (targetPath.startsWith('./')) {
                // 其他相对路径，如 ./file.png -> Memos/file.png
                targetPath = `Memos/${targetPath.substring(2)}`;
              } else if (targetPath.startsWith('/')) {
                // 绝对路径，移除开头的斜杠
                targetPath = targetPath.substring(1);
              }
              // 如果路径不以上述格式开头，保持原样，让文件代理处理

              // 使用文件代理
              convertedSrc = `/files/${targetPath}`;
            }
            return (
              <img
                src={convertedSrc}
                alt={alt}
                className="max-w-full h-auto rounded-md my-3"
                loading="lazy"
                onError={(e) => {
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
