import { useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

interface QuickMemoEditorProps {}

export function QuickMemoEditor({}: QuickMemoEditorProps) {
  const [content, setContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  // 检测操作系统
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutKey = isMac ? '⌘' : 'Ctrl';

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 创建 Memo 的 mutation
  const createMemoMutation = trpc.memos.create.useMutation({
    onSuccess: () => {
      setContent('');
      setIsPreview(false);
      // 使用 React Query 的 invalidation 来刷新数据
      utils.memos.getAll.invalidate();
    },
    onError: (error) => {
      if (error.message.includes('WebDAV is not enabled')) {
        alert('WebDAV 未配置，无法创建 Memo。请联系管理员配置 WebDAV 连接。');
      } else {
        alert(`创建失败: ${error.message}`);
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('请输入内容');
      return;
    }

    createMemoMutation.mutate({
      content: content.trim(),
      isPublic,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-900 dark:text-white">快速发布 Memo</h2>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className={`btn btn-xs ${isPreview ? 'btn-primary' : 'btn-outline'}`}
            >
              {isPreview ? '编辑' : '预览'}
            </button>
          </div>
        </div>
      </div>

      {/* 编辑器内容 */}
      <form onSubmit={handleSubmit}>
        <div className="p-4 space-y-3">
          {/* 内容输入 */}
          <div>
            {isPreview ? (
              <div className="min-h-[120px] p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <SimpleMarkdownPreview content={content} />
                </div>
              </div>
            ) : (
              <textarea
                id="memo-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="写下你的想法..."
                className="textarea textarea-bordered w-full resize-none min-h-[120px]"
                rows={5}
              />
            )}
          </div>

          {/* 工具栏和按钮 */}
          <div className="flex items-center justify-between">
            {/* 快速插入工具栏 */}
            {!isPreview && (
              <div className="flex items-center space-x-1">
                <div
                  className="tooltip tooltip-top mr-2"
                  data-tip="支持 Markdown 格式，第一个标题（# 标题）将作为 Memo 标题"
                >
                  <div className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const textarea = document.getElementById('memo-content') as HTMLTextAreaElement;
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selectedText = content.substring(start, end);
                      const newText = `**${selectedText}**`;
                      const newContent = content.substring(0, start) + newText + content.substring(end);
                      setContent(newContent);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + 2, start + 2 + selectedText.length);
                      }, 0);
                    }
                  }}
                  className="btn btn-xs btn-outline"
                  title="粗体"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const textarea = document.getElementById('memo-content') as HTMLTextAreaElement;
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selectedText = content.substring(start, end);
                      const newText = `*${selectedText}*`;
                      const newContent = content.substring(0, start) + newText + content.substring(end);
                      setContent(newContent);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + 1, start + 1 + selectedText.length);
                      }, 0);
                    }
                  }}
                  className="btn btn-xs btn-outline"
                  title="斜体"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const textarea = document.getElementById('memo-content') as HTMLTextAreaElement;
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const newContent = content.substring(0, start) + '\n- ' + content.substring(start);
                      setContent(newContent);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + 3, start + 3);
                      }, 0);
                    }
                  }}
                  className="btn btn-xs btn-outline"
                  title="列表"
                >
                  列表
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const textarea = document.getElementById('memo-content') as HTMLTextAreaElement;
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const selectedText = content.substring(textarea.selectionStart, textarea.selectionEnd);
                      const newText = `\`${selectedText}\``;
                      const newContent =
                        content.substring(0, start) + newText + content.substring(textarea.selectionEnd);
                      setContent(newContent);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + 1, start + 1 + selectedText.length);
                      }, 0);
                    }
                  }}
                  className="btn btn-xs btn-outline"
                  title="代码"
                >
                  代码
                </button>
              </div>
            )}

            <div className="flex items-center space-x-3">
              {/* 公开/私有开关 */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">{isPublic ? '公开' : '私有'}</span>
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-primary"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setContent('');
                }}
                className="btn btn-sm btn-ghost"
                disabled={createMemoMutation.isPending}
              >
                清空
              </button>

              <button
                type="submit"
                disabled={!content.trim() || createMemoMutation.isPending}
                className="btn btn-sm btn-primary"
              >
                {createMemoMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    发布中...
                  </>
                ) : (
                  <>
                    发布
                    <kbd className="kbd kbd-xs ml-1 opacity-60">{shortcutKey}+↵</kbd>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
