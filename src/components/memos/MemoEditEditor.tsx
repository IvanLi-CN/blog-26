import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { type Attachment, AttachmentGrid } from './AttachmentGrid';
import { MilkdownEditor } from './MilkdownEditor';
import { SimpleMarkdownPreview } from './SimpleMarkdownPreview';

interface MemoEditEditorProps {
  memoId: string;
  initialContent: string;
  initialIsPublic: boolean;
  initialAttachments: Attachment[];
  onSaveSuccess?: (memo: any) => void;
  onCancel?: () => void;
}

export function MemoEditEditor({
  memoId,
  initialContent,
  initialIsPublic,
  initialAttachments,
  onSaveSuccess,
  onCancel,
}: MemoEditEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [isPreview, setIsPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
  }>({
    show: false,
    title: '',
    message: '',
  });

  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 更新 Memo 的 mutation
  const updateMemoMutation = trpc.memos.update.useMutation({
    onSuccess: (updatedMemo) => {
      // 刷新相关查询
      utils.memos.getMemos.invalidate();
      utils.memos.getAll.invalidate();

      // 调用成功回调
      if (onSaveSuccess) {
        onSaveSuccess(updatedMemo);
      }
    },
    onError: (error) => {
      setErrorDialog({
        show: true,
        title: '更新失败',
        message: `更新失败: ${error.message}`,
      });
    },
  });

  // 处理内联图片上传（与快速发布编辑器保持一致）
  const processInlineImages = async (content: string): Promise<string> => {
    const base64ImageRegex = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
    let processedContent = content;
    const matches = Array.from(content.matchAll(base64ImageRegex));

    for (const match of matches) {
      const [fullMatch, altText, imageType, base64Data] = match;

      try {
        console.log('🖼️ [MemoEditEditor] 处理内联图片:', {
          altText,
          imageType,
          base64Length: base64Data.length,
        });

        // 生成文件名
        const timestamp = Date.now();
        const filename = `inline-${timestamp}.${imageType}`;

        // 构建上传路径：Memos/assets/filename（直接上传到正式目录）
        const uploadPath = `Memos/assets/${filename}`;

        // 将 base64 转换为 Blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: `image/${imageType}` });

        // 使用 /api/files/webdav/<path> API 上传（与快速发布编辑器保持一致）
        const response = await fetch(`/api/files/webdav/${uploadPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': `image/${imageType}`,
          },
          body: blob,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`上传失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ [MemoEditEditor] 内联图片上传成功:', {
          filename,
          uploadPath,
          result,
        });

        // 替换内联图片为上传后的路径（使用相对路径）
        const imagePath = `assets/${filename}`;
        const newImageMarkdown = `![${altText}](${imagePath})`;
        processedContent = processedContent.replace(fullMatch, newImageMarkdown);

        console.log('✅ [MemoEditEditor] 内联图片处理成功:', {
          filename,
          imagePath,
          newMarkdown: newImageMarkdown,
        });
      } catch (error) {
        console.error('❌ [MemoEditEditor] 内联图片处理失败:', error);
        // 如果上传失败，保留原始的 base64 图片
      }
    }

    return processedContent;
  };

  // 处理图片上传（完全参考快速发布编辑器的实现）
  const handleImageUpload = async (file: File): Promise<string> => {
    try {
      // 生成唯一文件名，避免冲突
      const timestamp = Date.now();
      const uniqueFileName = `${timestamp}_${file.name}`;

      // 构建上传路径：Memos/assets/filename（直接上传到正式目录）
      const uploadPath = `Memos/assets/${uniqueFileName}`;

      console.log('📦 [MemoEditEditor] 准备上传到路径:', uploadPath);

      // 使用 /api/files/webdav/<path> API 上传
      const response = await fetch(`/api/files/webdav/${uploadPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`上传失败: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ [MemoEditEditor] 图片上传成功:', {
        originalFileName: file.name,
        uniqueFileName,
        uploadPath,
        result,
      });

      // 返回相对路径（与快速发布编辑器保持一致）
      return `assets/${uniqueFileName}`;
    } catch (error) {
      console.error('❌ [MemoEditEditor] 图片上传失败:', error);
      throw error;
    }
  };

  // 处理文件上传（与快速发布编辑器保持一致）
  const handleFileUpload = async (files: FileList) => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // 生成唯一文件名，避免冲突
        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}_${file.name}`;

        // 构建上传路径：Memos/assets/filename（直接上传到正式目录）
        const uploadPath = `Memos/assets/${uniqueFileName}`;

        console.log('📦 [MemoEditEditor] 上传附件到路径:', uploadPath);

        // 使用 /api/files/webdav/<path> API 上传
        const response = await fetch(`/api/files/webdav/${uploadPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': file.type,
          },
          body: file,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`上传失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ [MemoEditEditor] 附件上传成功:', {
          originalFileName: file.name,
          uniqueFileName,
          uploadPath,
          result,
        });

        // 检测文件类型
        const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);

        // 返回附件信息（使用相对路径，与快速发布编辑器保持一致）
        const attachment: Attachment = {
          filename: file.name,
          path: `assets/${uniqueFileName}`, // 相对路径
          contentType: file.type,
          size: file.size,
          isImage,
        };

        return attachment;
      });

      const uploadedAttachments = await Promise.all(uploadPromises);
      setAttachments((prev) => [...prev, ...uploadedAttachments]);
    } catch (error) {
      console.error('File upload failed:', error);
      setErrorDialog({
        show: true,
        title: '上传失败',
        message: `文件上传失败: ${error.message}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // 拖拽处理
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

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  // 上传按钮点击处理
  const handleUploadButtonClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        handleFileUpload(files);
      }
    };
    input.click();
  };

  // 删除附件
  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // 提交表单
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

    try {
      console.log('🚀 [MemoEditEditor] 开始更新 Memo...');

      // 处理内联 base64 图片
      const processedContent = await processInlineImages(content.trim());

      console.log('📝 [MemoEditEditor] 提交处理后的内容:', {
        originalLength: content.trim().length,
        processedLength: processedContent.length,
        hasImages: processedContent.includes('!['),
      });

      updateMemoMutation.mutate({
        id: memoId,
        content: processedContent,
        isPublic,
        attachments,
      });
    } catch (error) {
      console.error('❌ [MemoEditEditor] 提交失败:', error);
      setErrorDialog({
        show: true,
        title: '提交失败',
        message: `处理内容时发生错误: ${error.message}`,
      });
    }
  };

  return (
    <div className="w-full" data-testid="memo-edit-editor">
      {/* 错误对话框 */}
      {errorDialog.show && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">{errorDialog.title}</h3>
            <p className="py-4 whitespace-pre-line">{errorDialog.message}</p>
            <div className="modal-action">
              <button className="btn" onClick={() => setErrorDialog({ show: false, title: '', message: '' })}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-100 shadow-xl" data-testid="memo-edit-editor-card">
        {/* 头部 */}
        <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-base-300">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-medium">编辑 Memo</h2>
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
                    placeholder="编辑你的想法..."
                    className="w-full"
                    data-testid="content-input"
                    onImageUpload={handleImageUpload}
                  />
                  {isDragOver && (
                    <div className="absolute inset-0 bg-primary bg-opacity-10 border-2 border-dashed border-primary rounded-md flex items-center justify-center">
                      <div className="text-primary font-medium">拖拽文件到这里上传</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 附件网格 */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-base-content/70">附件</label>
                <AttachmentGrid
                  attachments={attachments}
                  onRemove={handleRemoveAttachment}
                  showRemoveButton={!isPreview}
                />
              </div>
            )}

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

              {/* 右侧按钮组 */}
              <div className="flex items-center space-x-2">
                {/* 公开/私有切换 */}
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-base-content/60">{isPublic ? '公开' : '私有'}</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-xs toggle-primary"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    data-testid="public-toggle"
                  />
                </div>

                {/* 操作按钮 */}
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="btn btn-xs btn-outline"
                    data-testid="cancel-button"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={updateMemoMutation.isPending || isUploading}
                    className="btn btn-xs btn-primary"
                    data-testid="save-button"
                  >
                    {updateMemoMutation.isPending ? (
                      <>
                        <span className="loading loading-spinner loading-xs"></span>
                        保存中...
                      </>
                    ) : (
                      '保存'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
