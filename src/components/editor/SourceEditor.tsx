import { useEffect, useRef, useState } from 'react';

interface SourceEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  onImageUpload?: (file: File) => Promise<string>;
  'data-testid'?: string;
}

export function SourceEditor({
  content,
  onChange,
  placeholder = '开始编写...',
  className = '',
  onImageUpload,
  'data-testid': dataTestId,
}: SourceEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 计算行号
  const lineCount = content.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  // 同步滚动
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // 处理内容变化
  const handleContentChange = (newContent: string) => {
    onChange(newContent);
  };

  // 处理拖拽上传
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!onImageUpload) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    try {
      for (const file of imageFiles) {
        const imageUrl = await onImageUpload(file);
        const imageMarkdown = `![${file.name}](${imageUrl})`;

        // 在光标位置插入图片
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = content.substring(0, start) + imageMarkdown + content.substring(end);

        handleContentChange(newContent);

        // 更新光标位置
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = start + imageMarkdown.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
      }
    } catch (error) {
      console.error('图片上传失败:', error);
    }
  };

  // 处理键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab 键缩进
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      handleContentChange(newContent);

      // 更新光标位置
      setTimeout(() => {
        textarea.setSelectionRange(start + 2, start + 2);
      }, 0);
    }
  };

  return (
    <div
      className={`flex border border-base-300 rounded-md overflow-hidden ${className} ${
        isDragOver ? 'ring-2 ring-primary ring-opacity-50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={dataTestId}
    >
      {/* 行号区域 */}
      <div
        ref={lineNumbersRef}
        className="bg-base-200 px-2 py-1 text-right text-sm text-base-content/60 font-mono select-none overflow-hidden"
        style={{
          minWidth: `${Math.max(String(lineCount).length * 0.6 + 1, 2)}rem`,
          lineHeight: '1.5rem',
        }}
      >
        {lineNumbers.map((num) => (
          <div key={num} className="leading-6">
            {num}
          </div>
        ))}
      </div>

      {/* 编辑区域 */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 p-2 font-mono text-sm resize-none border-0 focus:outline-none bg-transparent leading-6"
        style={{
          minHeight: '200px',
          lineHeight: '1.5rem',
        }}
        spellCheck={false}
      />

      {/* 拖拽提示 */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-md flex items-center justify-center pointer-events-none">
          <div className="text-primary font-medium">拖拽图片到此处上传</div>
        </div>
      )}
    </div>
  );
}
