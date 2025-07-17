import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { type Attachment, AttachmentGrid } from './AttachmentGrid';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

interface QuickMemoEditorProps {}

export function QuickMemoEditor({}: QuickMemoEditorProps) {
  const [content, setContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showDragHint, setShowDragHint] = useState(false);

  // 检测操作系统
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutKey = isMac ? '⌘' : 'Ctrl';

  // 设置全局拖拽事件监听器
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => handleGlobalDragOver(e);
    const handleDragLeave = (e: DragEvent) => handleGlobalDragLeave(e);
    const handleDrop = (e: DragEvent) => handleGlobalDrop(e);

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [showDragHint, isPreview]);

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 创建 Memo 的 mutation
  const createMemoMutation = trpc.memos.create.useMutation({
    onSuccess: () => {
      setContent('');
      setIsPreview(false);
      setAttachments([]);
      // 使用 React Query 的 invalidation 来刷新数据
      utils.memos.getAll.invalidate();
    },
    onError: (error) => {
      if (error.message.includes('WebDAV is not enabled')) {
        alert('WebDAV 服务未配置，无法创建 Memo。请检查服务器配置。');
      } else {
        alert(`创建失败: ${error.message}`);
      }
    },
  });

  // 上传附件的 mutation
  const uploadAttachmentMutation = trpc.memos.uploadAttachment.useMutation({
    onError: (error) => {
      alert(`附件上传失败: ${error.message}`);
      setIsUploading(false);
    },
  });

  // 处理文件上传
  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // 使用临时 memo ID 上传到 assets/tmp 目录
      const tempMemoId = `temp_${Date.now()}.md`;

      const uploadPromises = files.map(async (file) => {
        return new Promise<Attachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const base64Content = (reader.result as string).split(',')[1];
              const result = await uploadAttachmentMutation.mutateAsync({
                memoId: tempMemoId,
                filename: file.name,
                content: base64Content,
                contentType: file.type,
                isTemporary: true, // 标记为临时文件
              });
              resolve(result);
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const uploadedAttachments = await Promise.all(uploadPromises);
      setAttachments((prev) => [...prev, ...uploadedAttachments]);
    } catch (error) {
      console.error('File upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  // 处理按钮点击上传
  const handleUploadButtonClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,.pdf,.doc,.docx,.txt,.md';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        handleFileUpload(Array.from(files));
      }
    };
    input.click();
  };

  // 处理全局拖拽事件
  const handleGlobalDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!showDragHint && !isPreview) {
      setShowDragHint(true);
    }
  };

  const handleGlobalDragLeave = (e: DragEvent) => {
    // 只有当拖拽离开整个窗口时才隐藏提示
    if (!e.relatedTarget) {
      setShowDragHint(false);
    }
  };

  const handleGlobalDrop = (e: DragEvent) => {
    e.preventDefault();
    setShowDragHint(false);
  };

  // 处理编辑器区域的拖拽
  const handleEditorDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleEditorDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleEditorDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setShowDragHint(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  // 处理粘贴事件
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files: File[] = [];

    items.forEach((item) => {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    });

    if (files.length > 0) {
      e.preventDefault();
      handleFileUpload(files);
    }
  };

  // 移除附件
  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('请输入内容');
      return;
    }

    createMemoMutation.mutate({
      content: content.trim(),
      isPublic,
      attachments,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="relative">
      {/* 全局拖拽提示 */}
      {showDragHint && !isPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-xl border-2 border-dashed border-primary">
            <div className="text-center">
              <div className="text-4xl mb-4">📎</div>
              <div className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">将文件拖拽到编辑器中上传</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">支持图片、文档等多种格式</div>
            </div>
          </div>
        </div>
      )}

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
            <div className="relative">
              {isPreview ? (
                <div className="min-h-[120px] p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900">
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <SimpleMarkdownPreview content={content} />
                  </div>
                </div>
              ) : (
                <div
                  className={`relative ${isDragOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}
                  onDragOver={handleEditorDragOver}
                  onDragLeave={handleEditorDragLeave}
                  onDrop={handleEditorDrop}
                >
                  <textarea
                    id="memo-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="写下你的想法..."
                    className="textarea textarea-bordered w-full resize-none min-h-[120px]"
                    rows={5}
                  />
                  {isDragOver && (
                    <div className="absolute inset-0 bg-primary bg-opacity-10 border-2 border-dashed border-primary rounded-md flex items-center justify-center">
                      <div className="text-primary font-medium">松开以上传文件</div>
                    </div>
                  )}
                </div>
              )}

              {/* 上传状态提示 */}
              {isUploading && (
                <div className="text-sm text-gray-500 mt-2 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                  正在上传附件...
                </div>
              )}
            </div>

            {/* 附件预览 */}
            <AttachmentGrid attachments={attachments} onRemove={handleRemoveAttachment} editable={!isPreview} />

            {/* 工具栏和按钮 */}
            <div className="flex items-center justify-between">
              {/* 快速插入工具栏 */}
              {!isPreview && (
                <div className="flex items-center space-x-1">
                  <div
                    className="tooltip tooltip-top mr-2"
                    data-tip="支持 Markdown 格式，第一个标题（# 标题）将作为 Memo 标题。支持拖拽、粘贴上传文件"
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
                  <button
                    type="button"
                    onClick={handleUploadButtonClick}
                    disabled={isUploading}
                    className="btn btn-xs btn-outline"
                    title="上传附件"
                  >
                    📎
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
                  disabled={!content.trim() || createMemoMutation.isPending || isUploading}
                  className="btn btn-sm btn-primary"
                >
                  {createMemoMutation.isPending ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      发布中...
                    </>
                  ) : isUploading ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      上传中...
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
    </div>
  );
}
