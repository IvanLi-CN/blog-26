import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github.css';

interface MarkdownPreviewProps {
  content: string;
  filePath?: string; // 当前 Markdown 文件的路径
}

// 转换图片路径用于预览显示
function convertImagePathForPreview(imagePath: string, currentFilePath?: string): string {
  // 如果已经是完整的 URL 或已经是 WebDAV API 路径，直接返回
  if (
    imagePath &&
    (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/api/webdav-image/'))
  ) {
    return imagePath;
  }

  // 如果是相对路径，需要基于当前文件路径解析
  if (imagePath && currentFilePath) {
    let resolvedPath = imagePath;

    // 获取当前文件所在的目录
    const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));

    if (imagePath.startsWith('./')) {
      // ./path -> 相对于当前目录
      resolvedPath = `${currentDir}/${imagePath.substring(2)}`;
    } else if (imagePath.startsWith('../')) {
      // ../path -> 相对于父目录
      const pathParts = currentDir.split('/').filter((part) => part);
      const imagePathParts = imagePath.split('/');

      // 处理 ../ 部分
      let upLevels = 0;
      for (const part of imagePathParts) {
        if (part === '..') {
          upLevels++;
        } else {
          break;
        }
      }

      // 构建解析后的路径
      const baseParts = pathParts.slice(0, -upLevels);
      const remainingParts = imagePathParts.slice(upLevels);
      resolvedPath = `/${baseParts.concat(remainingParts).join('/')}`;
    } else if (!imagePath.startsWith('/')) {
      // 相对路径（不以 ./ 开头）-> 相对于当前目录
      resolvedPath = `${currentDir}/${imagePath}`;
    } else {
      // 绝对路径
      resolvedPath = imagePath;
    }

    // 清理路径（移除开头的 /）
    resolvedPath = resolvedPath.replace(/^\/+/, '');

    // 使用代理 API 路径
    return `/api/webdav-image/${resolvedPath}`;
  }

  // 如果没有文件路径信息，使用简单的转换逻辑
  if (imagePath) {
    let processedPath = imagePath;
    if (imagePath.startsWith('./')) {
      processedPath = imagePath.substring(2);
    } else if (imagePath.startsWith('../')) {
      processedPath = imagePath.substring(3);
    } else if (!imagePath.startsWith('/')) {
      processedPath = imagePath;
    }

    return `/api/webdav-image/${processedPath}`;
  }

  return imagePath;
}

export function MarkdownPreview({ content, filePath }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return <div className="text-gray-500 italic text-center py-8">开始写作以查看预览...</div>;
  }

  // 解析frontmatter，只预览body部分
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  const bodyContent = match ? match[2] : content;

  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          // 自定义组件样式
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-6 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mt-8 mb-4 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-6 mb-3 first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside my-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-4 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="ml-4">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:text-gray-400 my-4">
              {children}
            </blockquote>
          ),
          code: ({ children, className, ...props }) => {
            const isInline = !className;
            const isMermaid = className === 'language-mermaid';

            if (isInline) {
              return (
                <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
              );
            }

            if (isMermaid) {
              return (
                <div className="relative bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto my-4">
                  <div className="absolute top-2 right-2 text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                    Mermaid 图表 (发布后渲染)
                  </div>
                  <code className="block font-mono text-sm text-gray-700 dark:text-gray-300">{children}</code>
                </div>
              );
            }

            return (
              <code className="block bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto font-mono text-sm">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto my-4">{children}</pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            const convertedSrc = convertImagePathForPreview(src || '', filePath);
            return (
              <span className="inline-block my-4 w-full">
                <img
                  src={convertedSrc}
                  alt={alt || '图片'}
                  className="max-w-full h-auto rounded-lg border shadow-sm"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const errorDiv = target.nextElementSibling as HTMLElement;
                    if (errorDiv) {
                      errorDiv.style.display = 'block';
                    }
                  }}
                />
                <span
                  style={{ display: 'none' }}
                  className="inline-block w-full bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500"
                >
                  <span className="block text-sm">📷 图片加载失败</span>
                  <span className="block text-xs mt-1 text-gray-400">{alt || '未命名图片'}</span>
                  <span className="block text-xs mt-1 font-mono text-gray-400 break-all">原始路径: {src}</span>
                  <span className="block text-xs mt-1 font-mono text-gray-400 break-all">转换路径: {convertedSrc}</span>
                </span>
              </span>
            );
          },
          hr: () => <hr className="border-t border-gray-300 my-6" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="border-collapse border border-gray-300 min-w-full">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 px-4 py-2 bg-gray-50 dark:bg-gray-800 font-semibold text-left">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-gray-300 px-4 py-2">{children}</td>,
        }}
      >
        {bodyContent}
      </ReactMarkdown>
    </div>
  );
}
