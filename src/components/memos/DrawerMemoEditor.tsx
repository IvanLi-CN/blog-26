import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { type Attachment, AttachmentGrid } from './AttachmentGrid';
import { MilkdownEditor } from './MilkdownEditor';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

// 本地草稿存储的键名
const DRAWER_DRAFT_STORAGE_KEY = 'memo-drawer-draft';

interface DraftData {
  content: string;
  isPublic: boolean;
  attachments: Attachment[];
  timestamp: number;
}

interface DrawerMemoEditorProps {
  onMemoCreated?: (memo: any) => void;
  onClose?: () => void;
}

export function DrawerMemoEditor({ onMemoCreated, onClose }: DrawerMemoEditorProps) {
  const [content, setContent] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // 错误对话框状态
  const [errorDialog, setErrorDialog] = useState<{ show: boolean; title: string; message: string }>({
    show: false,
    title: '',
    message: '',
  });

  // 加载草稿
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAWER_DRAFT_STORAGE_KEY);
    if (savedDraft) {
      try {
        const draft: DraftData = JSON.parse(savedDraft);
        // 检查草稿是否在24小时内
        const isRecent = Date.now() - draft.timestamp < 24 * 60 * 60 * 1000;
        if (isRecent) {
          setContent(draft.content);
          setIsPublic(draft.isPublic);
          setAttachments(draft.attachments || []);
        } else {
          // 清除过期草稿
          localStorage.removeItem(DRAWER_DRAFT_STORAGE_KEY);
        }
      } catch (error) {
        console.error('Failed to load draft:', error);
      }
    }
  }, []);

  // 保存草稿
  const saveDraft = (newContent: string, newIsPublic: boolean, newAttachments: Attachment[]) => {
    if (newContent.trim()) {
      const draft: DraftData = {
        content: newContent,
        isPublic: newIsPublic,
        attachments: newAttachments,
        timestamp: Date.now(),
      };
      localStorage.setItem(DRAWER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  };

  // 清除草稿
  const clearDraft = () => {
    localStorage.removeItem(DRAWER_DRAFT_STORAGE_KEY);
  };

  // 内容变化时自动保存草稿
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveDraft(content, isPublic, attachments);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [content, isPublic, attachments]);

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 创建 Memo 的 mutation
  const createMemoMutation = trpc.memos.create.useMutation({
    onSuccess: (newMemo) => {
      // 清除表单
      setContent('');
      setAttachments([]);
      setIsPublic(true);
      clearDraft();

      // 调用回调函数
      if (onMemoCreated) {
        onMemoCreated(newMemo);
      }

      // 使查询缓存失效
      utils.memos.getMemos.invalidate();

      // 通过 postMessage 通知父页面有新memo创建
      window.parent.postMessage(
        {
          type: 'MEMO_CREATED',
          memo: newMemo,
        },
        '*'
      );

      // 通过 postMessage 通知父页面关闭抽屉
      window.parent.postMessage({ type: 'CLOSE_MEMO_DRAWER' }, '*');

      // 关闭抽屉
      if (onClose) {
        onClose();
      }
    },
    onError: (error) => {
      setErrorDialog({
        show: true,
        title: '发布失败',
        message: error.message || '发布 Memo 时发生错误，请稍后重试。',
      });
    },
  });

  // 文件上传 mutation
  const uploadFileMutation = trpc.memos.uploadAttachment.useMutation({
    onSuccess: (result) => {
      const newAttachment: Attachment = {
        filename: result.filename,
        path: result.path,
        size: result.size,
        isImage: result.isImage,
      };
      setAttachments((prev) => [...prev, newAttachment]);
    },
    onError: (error) => {
      setErrorDialog({
        show: true,
        title: '上传失败',
        message: error.message || '文件上传失败，请稍后重试。',
      });
    },
  });

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      setErrorDialog({
        show: true,
        title: '内容不能为空',
        message: '请输入 Memo 内容后再发布。',
      });
      return;
    }

    createMemoMutation.mutate({
      content: content.trim(),
      isPublic: isPublic,
      attachments,
    });
  };

  // 处理文件拖拽
  const handleEditorDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleEditorDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleEditorDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Content = (reader.result as string).split(',')[1];
        uploadFileMutation.mutate({
          memoId: `temp_${Date.now()}`,
          filename: file.name,
          content: base64Content,
          contentType: file.type,
          isTemporary: true,
        });
      };
      reader.readAsDataURL(file);
    });
  };

  // 处理粘贴上传
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (files.length > 0) {
      e.preventDefault();
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Content = (reader.result as string).split(',')[1];
          uploadFileMutation.mutate({
            memoId: `temp_${Date.now()}`,
            filename: file.name,
            content: base64Content,
            contentType: file.type,
            isTemporary: true,
          });
        };
        reader.readAsDataURL(file);
      });
    }
  };

  return (
    <div className="w-full" onPaste={handlePaste}>
      {/* 编辑器内容 */}
      <form onSubmit={handleSubmit}>
        <div className="space-y-3">
          {/* 草稿提示 */}
          {content && (
            <div className="text-xs text-base-content/60 bg-base-200 px-2 py-1 rounded flex items-center justify-between">
              <span>💾 内容会自动保存为草稿 ({isPublic ? '公开' : '私有'})</span>
              <button
                type="button"
                onClick={() => {
                  setContent('');
                  setAttachments([]);
                  setIsPublic(true);
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
              <div className="min-h-[120px] p-3 border border-base-300 rounded-md bg-base-200">
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
                />
                {isDragOver && (
                  <div className="absolute inset-0 bg-primary bg-opacity-10 border-2 border-dashed border-primary rounded-md flex items-center justify-center">
                    <div className="text-primary font-medium">松开以上传文件</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 附件显示 */}
          {attachments.length > 0 && (
            <div>
              <AttachmentGrid
                attachments={attachments}
                editable={true}
                onRemove={(index) => {
                  setAttachments((prev) => prev.filter((_, i) => i !== index));
                }}
              />
            </div>
          )}

          {/* 工具栏和按钮 */}
          <div className="flex items-center justify-between">
            {/* 左侧工具 */}
            <div className="flex items-center space-x-2">
              <div className="tooltip tooltip-top" data-tip="支持 Markdown 格式">
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
            </div>

            {/* 右侧按钮 */}
            <div className="flex items-center space-x-2">
              {/* 公开/私有切换 */}
              <div className="form-control">
                <label className="label cursor-pointer">
                  <span className="label-text mr-2 text-sm">{isPublic ? '公开' : '私有'}</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                </label>
              </div>

              {/* 预览切换 */}
              <button
                type="button"
                onClick={() => setIsPreview(!isPreview)}
                className={`btn btn-sm ${isPreview ? 'btn-primary' : 'btn-outline'}`}
              >
                {isPreview ? '编辑' : '预览'}
              </button>

              {/* 发布按钮 */}
              <button
                type="submit"
                disabled={createMemoMutation.isPending || !content.trim()}
                className="btn btn-primary btn-sm"
              >
                {createMemoMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-xs mr-1"></span>
                    发布中...
                  </>
                ) : (
                  '发布'
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* 错误提示对话框 */}
      {errorDialog.show && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-error">{errorDialog.title}</h3>
            <p className="py-4 whitespace-pre-line">{errorDialog.message}</p>
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
