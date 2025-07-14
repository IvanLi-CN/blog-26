interface EditorToolbarProps {
  onInsertMarkdown: (before: string, after?: string) => void;
  onInsertAtCursor: (text: string) => void;
  onGetMarkdown: () => string;
  onSave?: () => void;
  isSaving?: boolean;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
}

export function EditorToolbar({
  onInsertMarkdown,
  onInsertAtCursor,
  onGetMarkdown,
  onSave,
  isSaving,
  saveStatus,
}: EditorToolbarProps) {
  const ToolbarButton = ({
    onClick,
    isActive = false,
    disabled = false,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive ? 'bg-gray-200 dark:bg-gray-600' : ''
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50 dark:bg-gray-800">
      {/* 文本格式 */}
      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <ToolbarButton onClick={() => onInsertMarkdown('**', '**')} title="Bold">
          <strong>B</strong>
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertMarkdown('*', '*')} title="Italic">
          <em>I</em>
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertMarkdown('~~', '~~')} title="Strikethrough">
          <s>S</s>
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertMarkdown('`', '`')} title="Inline Code">
          <code>&lt;/&gt;</code>
        </ToolbarButton>
      </div>

      {/* 标题 */}
      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <ToolbarButton onClick={() => onInsertAtCursor('# ')} title="Heading 1">
          H1
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertAtCursor('## ')} title="Heading 2">
          H2
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertAtCursor('### ')} title="Heading 3">
          H3
        </ToolbarButton>
      </div>

      {/* 列表 */}
      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <ToolbarButton onClick={() => onInsertAtCursor('- ')} title="Bullet List">
          •
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertAtCursor('1. ')} title="Numbered List">
          1.
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertAtCursor('- [ ] ')} title="Task List">
          ☐
        </ToolbarButton>
      </div>

      {/* 其他格式 */}
      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <ToolbarButton onClick={() => onInsertMarkdown('> ', '')} title="Quote">
          "
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertAtCursor('```\n\n```')} title="Code Block">
          {'{}'}
        </ToolbarButton>

        <ToolbarButton onClick={() => onInsertAtCursor('\n---\n')} title="Horizontal Rule">
          —
        </ToolbarButton>
      </div>

      {/* 链接和图片 */}
      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <ToolbarButton
          onClick={() => {
            const url = window.prompt('链接 URL:');
            const text = window.prompt('链接文本:') || '链接';
            if (url) {
              onInsertAtCursor(`[${text}](${url})`);
            }
          }}
          title="Add Link"
        >
          🔗
        </ToolbarButton>

        <ToolbarButton
          onClick={() => {
            const url = window.prompt('图片 URL (支持相对路径如 /images/pic.jpg 或完整 URL):');
            const alt = window.prompt('图片描述 (Alt text):') || '图片';
            if (url) {
              onInsertAtCursor(`![${alt}](${url})`);
            }
          }}
          title="Add Image"
        >
          🖼️
        </ToolbarButton>
      </div>

      {/* 表格 */}
      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <ToolbarButton
          onClick={() =>
            onInsertAtCursor(
              '\n| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n'
            )
          }
          title="Insert Table"
        >
          ⊞
        </ToolbarButton>
      </div>

      {/* 保存和导出 */}
      <div className="flex items-center gap-1 ml-auto">
        {onSave && (
          <ToolbarButton
            onClick={onSave}
            disabled={isSaving}
            title={isSaving ? '保存中...' : '保存 (Ctrl/Cmd + S)'}
            isActive={saveStatus === 'saved'}
          >
            {isSaving ? '⏳' : saveStatus === 'saved' ? '✅' : saveStatus === 'error' ? '❌' : '💾'}
          </ToolbarButton>
        )}

        <ToolbarButton
          onClick={() => {
            const content = onGetMarkdown();
            navigator.clipboard.writeText(content);
            alert('Markdown 内容已复制到剪贴板');
          }}
          title="Copy Markdown"
        >
          📋
        </ToolbarButton>
      </div>
    </div>
  );
}
