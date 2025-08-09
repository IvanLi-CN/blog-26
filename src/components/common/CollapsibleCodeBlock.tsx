import hljs from 'highlight.js';
import { useMemo, useState } from 'react';

interface CollapsibleCodeBlockProps {
  children: string;
  className?: string;
  maxLines?: number;
  previewLines?: number;
}

export function CollapsibleCodeBlock({
  children,
  className = '',
  maxLines = 10,
  previewLines = 7,
}: CollapsibleCodeBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 提取语言信息
  const language = className.replace('language-', '') || 'text';

  // 计算代码行数
  const codeLines = children.trim().split('\n');
  const totalLines = codeLines.length;

  // 判断是否需要折叠
  const needsCollapse = totalLines > maxLines;

  // 获取显示的代码内容和语法高亮 - 使用 useMemo 确保在状态变化时重新计算
  const highlightedCode = useMemo(() => {
    const code = needsCollapse && !isExpanded ? codeLines.slice(0, previewLines).join('\n') : children.trim();

    // 语法高亮
    let highlighted = code;
    try {
      if (language && language !== 'text' && hljs.getLanguage(language)) {
        highlighted = hljs.highlight(code, { language }).value;
      } else {
        highlighted = hljs.highlightAuto(code).value;
      }
    } catch (error) {
      console.warn('Syntax highlighting failed:', error);
      highlighted = code;
    }

    return highlighted;
  }, [children, language, needsCollapse, isExpanded, codeLines, previewLines]);

  return (
    <div className="relative my-4">
      <pre className="overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-4 pb-2">
        <code className={className} dangerouslySetInnerHTML={{ __html: highlightedCode }} />

        {needsCollapse && (
          <div className="flex justify-center pt-2 border-t border-gray-200 dark:border-gray-700 mt-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded transition-colors duration-200 flex items-center gap-1"
              type="button"
            >
              {isExpanded ? (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  收起
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  展开全部 ({totalLines} 行)
                </>
              )}
            </button>
          </div>
        )}
      </pre>
    </div>
  );
}
