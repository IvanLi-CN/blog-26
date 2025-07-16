interface SimpleMarkdownPreviewProps {
  content: string;
}

export function SimpleMarkdownPreview({ content }: SimpleMarkdownPreviewProps) {
  if (!content.trim()) {
    return <div className="text-gray-500 italic text-center py-8">开始写作以查看预览...</div>;
  }

  // 简单的 Markdown 转换
  const convertMarkdown = (text: string): string => {
    // 先按段落分割处理
    const paragraphs = text.split(/\n\s*\n/);

    const processedParagraphs = paragraphs.map((paragraph) => {
      if (!paragraph.trim()) return '';

      let processed = paragraph.trim();

      // 标题处理
      if (processed.match(/^### /)) {
        return processed.replace(/^### (.*)$/gm, '<h3 class="text-lg font-semibold mb-2 mt-4">$1</h3>');
      }
      if (processed.match(/^## /)) {
        return processed.replace(/^## (.*)$/gm, '<h2 class="text-xl font-semibold mb-3 mt-5">$1</h2>');
      }
      if (processed.match(/^# /)) {
        return processed.replace(/^# (.*)$/gm, '<h1 class="text-2xl font-bold mb-4 mt-6">$1</h1>');
      }

      // 代码块处理
      if (processed.includes('```')) {
        return processed.replace(
          /```([\s\S]*?)```/g,
          '<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto my-4"><code>$1</code></pre>'
        );
      }

      // 引用处理
      if (processed.match(/^> /)) {
        return processed.replace(
          /^> (.*)$/gm,
          '<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 my-4">$1</blockquote>'
        );
      }

      // 无序列表处理
      if (processed.match(/^- /m)) {
        const listItems = processed
          .split('\n')
          .map((line) => (line.match(/^- (.*)$/) ? `<li class="ml-4">• ${line.replace(/^- /, '')}</li>` : line))
          .join('\n');
        return `<ul class="my-2 space-y-1">${listItems}</ul>`;
      }

      // 有序列表处理
      if (processed.match(/^\d+\. /m)) {
        const listItems = processed
          .split('\n')
          .map((line) => (line.match(/^\d+\. (.*)$/) ? `<li class="ml-4">${line.replace(/^\d+\. /, '')}</li>` : line))
          .join('\n');
        return `<ol class="my-2 space-y-1 list-decimal list-inside">${listItems}</ol>`;
      }

      // 行内格式处理
      processed = processed
        // 粗体
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
        // 斜体
        .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        // 行内代码
        .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">$1</code>')
        // 链接
        .replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" class="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">$1</a>'
        )
        // 换行
        .replace(/\n/g, '<br>');

      // 普通段落
      return `<p class="mb-4">${processed}</p>`;
    });

    return processedParagraphs.filter((p) => p).join('');
  };

  const htmlContent = convertMarkdown(content);

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: htmlContent }} />
  );
}
