import { useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { type Attachment, AttachmentGrid } from './AttachmentGrid';
import { MilkdownEditor } from './MilkdownEditor';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

interface MemoEditorProps {
  memo: any;
  onSave: (updatedMemo: any) => void;
  onCancel: () => void;
}

export function MemoEditor({ memo, onSave, onCancel }: MemoEditorProps) {
  const [content, setContent] = useState(memo.content || '');
  const [isPublic, setIsPublic] = useState(memo.isPublic ?? true);
  const [attachments, setAttachments] = useState<Attachment[]>(memo.attachments || []);
  const [isPreview, setIsPreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // 错误对话框状态
  const [errorDialog, setErrorDialog] = useState<{ show: boolean; title: string; message: string }>({
    show: false,
    title: '',
    message: '',
  });

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 更新 Memo 的 mutation
  const updateMemoMutation = trpc.memos.update.useMutation({
    onSuccess: (updatedMemo) => {
      // 使查询缓存失效
      utils.memos.getMemos.invalidate();

      // 调用保存回调
      onSave(updatedMemo);
    },
    onError: (error) => {
      setErrorDialog({
        show: true,
        title: '保存失败',
        message: error.message || '保存 Memo 时发生错误，请稍后重试。',
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
        message: '请输入 Memo 内容后再保存。',
      });
      return;
    }

    updateMemoMutation.mutate({
      id: memo.id,
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
          memoId: memo.id,
          filename: file.name,
          content: base64Content,
          contentType: file.type,
          isTemporary: false,
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
            memoId: memo.id,
            filename: file.name,
            content: base64Content,
            contentType: file.type,
            isTemporary: false,
          });
        };
        reader.readAsDataURL(file);
      });
    }
  };

  return (
    <div className="w-full h-full flex flex-col" onPaste={handlePaste}>
      {/* 编辑器内容 */}
      <form onSubmit={handleSubmit} className="h-full flex flex-col">
        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          {/* 内容输入 */}
          <div className="relative flex-1 min-h-0 overflow-y-auto">
            {isPreview ? (
              <div className="h-full p-4 border border-base-300 rounded-md bg-base-200 overflow-y-auto">
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
                  placeholder="编辑你的想法..."
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
          <div className="flex items-center justify-between pt-4 border-t border-base-300 flex-shrink-0 bg-base-100">
            {/* 左侧工具 */}
            <div className="flex items-center space-x-4">
              {/* 公开/私有切换 */}
              <div className="form-control">
                <label className="label cursor-pointer">
                  <span className="label-text mr-2">{isPublic ? '公开' : '私有'}</span>
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
            </div>

            {/* 右侧按钮 */}
            <div className="flex items-center space-x-2">
              {/* 取消按钮 */}
              <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
                取消
              </button>

              {/* 保存按钮 */}
              <button
                type="submit"
                disabled={updateMemoMutation.isPending || !content.trim()}
                className="btn btn-primary btn-sm"
              >
                {updateMemoMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-xs mr-1"></span>
                    保存中...
                  </>
                ) : (
                  '保存'
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
