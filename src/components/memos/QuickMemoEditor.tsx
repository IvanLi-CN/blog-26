import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { type Attachment, AttachmentGrid } from './AttachmentGrid';
import { MilkdownEditor } from './MilkdownEditor';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

// 本地草稿存储的键名
const DRAFT_STORAGE_KEY = 'memo-draft';

interface DraftData {
  content: string;
  isPublic: boolean;
  attachments: Attachment[];
  timestamp: number;
}

interface QuickMemoEditorProps {
  onMemoCreated?: (memo: any) => void;
}

export function QuickMemoEditor({ onMemoCreated }: QuickMemoEditorProps) {
  const [content, setContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showDragHint, setShowDragHint] = useState(false);
  // 错误对话框状态
  const [errorDialog, setErrorDialog] = useState<{ show: boolean; title: string; message: string }>({
    show: false,
    title: '',
    message: '',
  });

  // 检测操作系统
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutKey = isMac ? '⌘' : 'Ctrl';

  // 加载本地草稿
  useEffect(() => {
    const loadDraft = () => {
      try {
        const draftStr = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (draftStr) {
          const draft: DraftData = JSON.parse(draftStr);
          // 只加载24小时内的草稿
          if (Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) {
            setContent(draft.content);
            // 确保草稿恢复时默认为公开状态，除非用户明确设置为私有
            setIsPublic(draft.isPublic);
            setAttachments(draft.attachments);
          } else {
            // 清除过期草稿
            localStorage.removeItem(DRAFT_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error('加载草稿失败:', error);
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    };

    loadDraft();
  }, []);

  // 自动保存草稿
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content.trim() || attachments.length > 0) {
        saveDraft(content, isPublic, attachments);
      }
    }, 1000); // 1秒后保存

    return () => clearTimeout(timer);
  }, [content, isPublic, attachments]);

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

  // 保存草稿到本地存储
  const saveDraft = (draftContent: string, draftIsPublic: boolean, draftAttachments: Attachment[]) => {
    if (!draftContent.trim()) {
      // 如果内容为空，清除草稿
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    try {
      const draft: DraftData = {
        content: draftContent,
        isPublic: draftIsPublic,
        attachments: draftAttachments,
        timestamp: Date.now(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error('保存草稿失败:', error);
    }
  };

  // 清除草稿
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 创建 Memo 的 mutation
  const createMemoMutation = trpc.memos.create.useMutation({
    onSuccess: (newMemo) => {
      // 清除草稿
      clearDraft();

      // 清空编辑器
      setContent('');
      setIsPreview(false);
      setAttachments([]);

      // 如果有回调函数，直接添加到列表中
      if (onMemoCreated) {
        onMemoCreated(newMemo);
      } else {
        // 否则使用 React Query 的 invalidation 来刷新数据
        utils.memos.getMemos.invalidate();
        utils.memos.getAll.invalidate(); // 保持向后兼容
      }
    },
    onError: (error) => {
      // 保存草稿
      saveDraft(content, isPublic, attachments);

      if (error.message.includes('WebDAV is not enabled')) {
        setErrorDialog({
          show: true,
          title: '服务配置错误',
          message: 'WebDAV 服务未配置，无法创建 Memo。请检查服务器配置。\n\n内容已保存为草稿，下次打开时可继续编辑。',
        });
      } else {
        setErrorDialog({
          show: true,
          title: '创建失败',
          message: `创建失败: ${error.message}\n\n内容已保存为草稿，下次打开时可继续编辑。`,
        });
      }
    },
  });

  // 上传附件的 mutation
  const uploadAttachmentMutation = trpc.memos.uploadAttachment.useMutation({
    onError: (error) => {
      setErrorDialog({
        show: true,
        title: '上传失败',
        message: `附件上传失败: ${error.message}`,
      });
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
              resolve(result as Attachment);
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
    const input = document.querySelector('[data-testid="attachment-input"]') as HTMLInputElement;
    if (input) {
      input.click();
    }
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

  // 移除附件
  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setErrorDialog({
        show: true,
        title: '内容为空',
        message: '请输入内容',
      });
      return;
    }

    createMemoMutation.mutate({
      content: content.trim(),
      isPublic,
      attachments,
    });
  };

  return (
    <div className="relative">
      {/* 全局拖拽提示 */}
      {showDragHint && !isPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 sm:p-8 shadow-xl border-2 border-dashed border-primary max-w-sm sm:max-w-md">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">📎</div>
              <div className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                将文件拖拽到编辑器中上传
              </div>
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">支持图片、文档等多种格式</div>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-100 shadow-xl mb-6" data-testid="quick-memo-editor">
        {/* 头部 */}
        <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-base-300">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-medium">快速发布 Memo</h2>
            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                type="button"
                onClick={() => setIsPreview(!isPreview)}
                className={`btn btn-xs ${isPreview ? 'btn-primary' : 'btn-outline'}`}
                data-testid={isPreview ? 'edit-button' : 'preview-button'}
              >
                {isPreview ? '编辑' : '预览'}
              </button>
            </div>
          </div>
        </div>

        {/* 编辑器内容 */}
        <form onSubmit={handleSubmit}>
          <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
            {/* 草稿提示 */}
            {content && (
              <div className="text-xs text-base-content/60 bg-base-200 px-2 py-1 rounded flex items-center justify-between">
                <span>💾 内容会自动保存为草稿 ({isPublic ? '公开' : '私有'})</span>
                <button
                  type="button"
                  onClick={() => {
                    setContent('');
                    setAttachments([]);
                    setIsPublic(true); // 重置为默认公开状态
                    clearDraft();
                  }}
                  className="text-xs text-base-content/40 hover:text-base-content/80 ml-2"
                  title="清除草稿"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 内容输入 */}
            <div className="relative">
              {isPreview ? (
                <div className="min-h-[100px] sm:min-h-[120px] p-2 sm:p-3 border border-base-300 rounded-md bg-base-200">
                  <div className="prose prose-sm max-w-none">
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
                  <MilkdownEditor
                    content={content}
                    onChange={setContent}
                    placeholder="写下你的想法..."
                    className="w-full"
                    data-testid="content-input"
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
                <div className="text-sm text-base-content/60 mt-2 flex items-center">
                  <span className="loading loading-spinner loading-xs mr-2"></span>
                  正在上传附件...
                </div>
              )}
            </div>

            {/* 隐藏的文件输入 */}
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.md"
              onChange={(e) => {
                const files = e.target.files;
                if (files) {
                  handleFileUpload(Array.from(files));
                }
              }}
              className="hidden"
              data-testid="attachment-input"
            />

            {/* 附件预览 */}
            <AttachmentGrid
              attachments={attachments}
              onRemove={handleRemoveAttachment}
              editable={!isPreview}
              data-testid="attachment-grid"
            />

            {/* 工具栏和按钮 */}
            <div className="flex items-center justify-between">
              {/* 快速插入工具栏 */}
              {!isPreview && (
                <div className="flex items-center space-x-1">
                  <div
                    className="tooltip tooltip-top mr-2"
                    data-tip="支持 Markdown 格式，第一个标题（# 标题）将作为 Memo 标题。支持拖拽、粘贴上传文件"
                  >
                    <div className="w-4 h-4 text-base-content/40 hover:text-base-content/60 cursor-help">
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
                    onClick={handleUploadButtonClick}
                    disabled={isUploading}
                    className="btn btn-xs btn-outline"
                    title="上传附件"
                    data-testid="upload-button"
                  >
                    📎
                  </button>
                </div>
              )}

              <div className="flex items-center space-x-2 sm:space-x-3">
                {/* 公开/私有开关 */}
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <span className="text-xs sm:text-sm text-base-content/70">{isPublic ? '公开' : '私有'}</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    data-testid="public-toggle"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setContent('');
                    setAttachments([]);
                    clearDraft();
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
                  data-testid="submit-button"
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

      {/* 错误提示对话框 */}
      {errorDialog.show && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm sm:max-w-md">
            <h3 className="font-bold text-base sm:text-lg text-error">{errorDialog.title}</h3>
            <p className="py-3 sm:py-4 text-sm sm:text-base whitespace-pre-line">{errorDialog.message}</p>
            <div className="modal-action">
              <button onClick={() => setErrorDialog({ show: false, title: '', message: '' })} className="btn">
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
