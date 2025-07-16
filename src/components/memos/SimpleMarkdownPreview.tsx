interface SimpleMarkdownPreviewProps {
  content: string;
}

export function SimpleMarkdownPreview({ content }: SimpleMarkdownPreviewProps) {
  if (!content.trim()) {
    return <div className="text-gray-500 italic text-center py-8">开始写作以查看预览...</div>;
  }

  // 简单的 Markdown 转换
  const convertMarkdown = (text: string): string => {
    return (
      text
        // 标题
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mb-2 mt-4">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mb-3 mt-5">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4 mt-6">$1</h1>')
        // 粗体
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
        // 斜体
        .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        // 代码块
        .replace(
          /```([\s\S]*?)```/g,
          '<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto my-4"><code>$1</code></pre>'
        )
        // 行内代码
        .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">$1</code>')
        // 链接
        .replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" class="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">$1</a>'
        )
        // 无序列表
        .replace(/^\- (.*$)/gim, '<li class="ml-4">• $1</li>')
        .replace(/(<li class="ml-4">.*<\/li>)/s, '<ul class="my-2">$1</ul>')
        // 有序列表
        .replace(/^\d+\. (.*$)/gim, '<li class="ml-4">$1</li>')
        // 引用
        .replace(
          /^> (.*$)/gim,
          '<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 my-4">$1</blockquote>'
        )
        // 段落
        .replace(/\n\n/g, '</p><p class="mb-4">')
        .replace(/^(.*)$/gim, '<p class="mb-4">$1</p>')
        // 清理空段落
        .replace(/<p class="mb-4"><\/p>/g, '')
        // 换行
        .replace(/\n/g, '<br>')
    );
  };

  const htmlContent = convertMarkdown(content);

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: htmlContent }} />
  );
}
