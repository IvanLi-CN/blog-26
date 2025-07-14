import { useEffect, useRef, useState } from 'react';
import { EditorToolbar } from './EditorToolbar.tsx';
import { MarkdownPreview } from './MarkdownPreview';

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  filePath?: string; // 当前文件路径，用于解析相对图片路径
  onSave?: () => void;
  isSaving?: boolean;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
}

export function MarkdownEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  className = '',
  filePath,
  onSave,
  isSaving,
  saveStatus,
}: MarkdownEditorProps) {
  const [markdownContent, setMarkdownContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 同步外部内容变化
  useEffect(() => {
    if (content !== markdownContent) {
      setMarkdownContent(content);
    }
  }, [content]);

  const handleContentChange = (newContent: string) => {
    setMarkdownContent(newContent);
    onChange(newContent);
  };

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = markdownContent.substring(start, end);
    const newText = `${before}${selectedText}${after}`;

    const newContent = markdownContent.substring(0, start) + newText + markdownContent.substring(end);

    handleContentChange(newContent);

    // 重新设置光标位置
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length + after.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const newContent = markdownContent.substring(0, start) + text + markdownContent.substring(end);

    handleContentChange(newContent);

    // 重新设置光标位置
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + text.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <EditorToolbar
        onInsertMarkdown={insertMarkdown}
        onInsertAtCursor={insertAtCursor}
        onGetMarkdown={() => markdownContent}
        onSave={onSave}
        isSaving={isSaving}
        saveStatus={saveStatus}
      />

      <div className="flex flex-1 border-t">
        {/* 左侧编辑器 */}
        <div className="w-1/2 border-r flex flex-col">
          <div className="p-2 bg-gray-50 dark:bg-gray-800 border-b text-sm font-medium text-gray-700 dark:text-gray-300">
            Markdown 源码（包含 Frontmatter）
          </div>
          <textarea
            ref={textareaRef}
            value={markdownContent}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-4 font-mono text-sm resize-none border-0 focus:outline-none bg-transparent overflow-y-scroll"
            style={{ height: '600px' }}
          />
        </div>

        {/* 右侧预览 */}
        <div className="w-1/2 flex flex-col">
          <div className="p-2 bg-gray-50 dark:bg-gray-800 border-b text-sm font-medium text-gray-700 dark:text-gray-300">
            实时预览
          </div>
          <div className="overflow-y-scroll p-4" style={{ height: '600px' }}>
            <div className="prose prose-lg max-w-none dark:prose-invert">
              <MarkdownPreview content={markdownContent} filePath={filePath} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
