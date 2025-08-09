import { useEffect, useState } from 'react';
import { removeTagsFromContent } from '~/utils/utils';

interface SimpleMarkdownPreviewProps {
  content: string;
  removeTags?: boolean; // 是否移除标签，默认为 false
}

export function SimpleMarkdownPreview({ content, removeTags = false }: SimpleMarkdownPreviewProps) {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function processMarkdown() {
      if (!content.trim()) {
        setHtmlContent('');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // 如果需要移除标签，则处理内容
        const processedContent = removeTags ? removeTagsFromContent(content) : content;

        // 调用 API 端点来处理 Markdown
        const response = await fetch('/api/markdown', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: processedContent }),
        });

        if (!response.ok) {
          throw new Error('Failed to process markdown');
        }

        const { html } = await response.json();
        setHtmlContent(html);
      } catch (error) {
        console.error('Error processing markdown:', error);
        setHtmlContent('<p class="text-red-500">Markdown 处理出错</p>');
      } finally {
        setIsLoading(false);
      }
    }

    processMarkdown();
  }, [content, removeTags]);

  if (isLoading) {
    return <div className="text-gray-500 italic text-center py-8">加载中...</div>;
  }

  if (!content.trim()) {
    return <div className="text-gray-500 italic text-center py-8">开始写作以查看预览...</div>;
  }

  return (
    <div
      className="markdown-preview prose prose-sm md:prose-base max-w-none text-sm md:text-base"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
