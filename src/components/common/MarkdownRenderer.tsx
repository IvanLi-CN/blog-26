import { useEffect, useState } from 'react';
import { removeTagsFromContent } from '~/utils/utils';

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
    return <div className="text-gray-500 italic text-center py-8">暂无内容</div>;
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: htmlContent }} />;
}
