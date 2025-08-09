import { useEffect, useState } from 'react';
import { SourceEditor } from '../editor/SourceEditor';
import { type Attachment, AttachmentGrid } from '../memos/AttachmentGrid';
import { MilkdownEditor } from '../memos/MilkdownEditor';
import { SimpleMarkdownPreview } from '../memos/SimpleMarkdownPreview';

// 编辑器模式类型
type EditorMode = 'wysiwyg' | 'source' | 'preview';

export interface UniversalEditorProps {
  // 内容相关
  initialContent: string;
  onContentChange?: (content: string) => void;
  placeholder?: string;

  // 附件相关
  initialAttachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  enableAttachments?: boolean;
  attachmentBasePath?: string; // 附件上传的基础路径，如 'Memos/assets' 或 'Project/assets'

  // 公开/私有切换
  initialIsPublic?: boolean;
  onPublicChange?: (isPublic: boolean) => void;
  enablePublicToggle?: boolean;

  // 保存相关
  onSave?: (data: { content: string; isPublic?: boolean; attachments?: Attachment[] }) => Promise<void>;
  onCancel?: () => void;
  isSaving?: boolean;

  // UI 配置
  title?: string;
  showPreview?: boolean;
  enableDragDrop?: boolean;
  className?: string;

  // 测试相关
  'data-testid'?: string;
}

export function UniversalEditor({
  initialContent,
  onContentChange,
  placeholder = '开始编写...',

  initialAttachments = [],
  onAttachmentsChange,
  enableAttachments = true,
  attachmentBasePath = 'assets',

  initialIsPublic = false,
  onPublicChange,
  enablePublicToggle = true,

  onSave,
  onCancel,
  isSaving = false,

  title = '编辑器',
  showPreview: initialShowPreview = true,
  enableDragDrop = true,
  className = '',

  'data-testid': dataTestId = 'universal-editor',
}: UniversalEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
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

  // 监听 initialContent 变化并更新内容（只在内容真正不同时更新）
  useEffect(() => {
    if (initialContent !== content) {
      setContent(initialContent);
    }
  }, [initialContent]); // 移除 content 依赖避免循环

  // 监听 initialAttachments 变化并更新附件
  useEffect(() => {
    if (JSON.stringify(initialAttachments) !== JSON.stringify(attachments)) {
      setAttachments(initialAttachments);
    }
  }, [initialAttachments]); // 移除 attachments 依赖避免循环

  // 监听 initialIsPublic 变化并更新公开状态
  useEffect(() => {
    if (initialIsPublic !== isPublic) {
      setIsPublic(initialIsPublic);
    }
  }, [initialIsPublic]); // 移除 isPublic 依赖避免循环

  // 内容变化处理
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    onContentChange?.(newContent);
  };

  // 公开状态变化处理
  const handlePublicChange = (newIsPublic: boolean) => {
    setIsPublic(newIsPublic);
    onPublicChange?.(newIsPublic);
  };

  // 附件变化处理
  const handleAttachmentsChange = (newAttachments: Attachment[]) => {
    setAttachments(newAttachments);
    onAttachmentsChange?.(newAttachments);
  };

  // 处理内联图片上传
  const processInlineImages = async (content: string): Promise<string> => {
    const base64ImageRegex = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
    let processedContent = content;
    const matches = Array.from(content.matchAll(base64ImageRegex));

    for (const match of matches) {
      const [fullMatch, altText, imageType, base64Data] = match;

      try {
        console.log('🖼️ [UniversalEditor] 处理内联图片:', {
          altText,
          imageType,
          base64Length: base64Data.length,
        });

        // 生成文件名
        const timestamp = Date.now();
        const filename = `inline-${timestamp}.${imageType}`;

        // 构建上传路径
        const uploadPath = `${attachmentBasePath}/${filename}`;

        // 将 base64 转换为 Blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: `image/${imageType}` });

        // 使用 /api/files/webdav/<path> API 上传
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
        console.log('✅ [UniversalEditor] 内联图片上传成功:', {
          filename,
          uploadPath,
          result,
        });

        // 替换内联图片为上传后的路径（使用相对路径）
        const imagePath = `${attachmentBasePath.split('/').pop()}/${filename}`;
        const newImageMarkdown = `![${altText}](${imagePath})`;
        processedContent = processedContent.replace(fullMatch, newImageMarkdown);

        console.log('✅ [UniversalEditor] 内联图片处理成功:', {
          filename,
          imagePath,
          newMarkdown: newImageMarkdown,
        });
      } catch (error) {
        console.error('❌ [UniversalEditor] 内联图片处理失败:', error);
        // 如果上传失败，保留原始的 base64 图片
      }
    }

    return processedContent;
  };

  // 处理图片上传
  const handleImageUpload = async (file: File): Promise<string> => {
    try {
      // 生成唯一文件名，避免冲突
      const timestamp = Date.now();
      const uniqueFileName = `${timestamp}_${file.name}`;

      // 构建上传路径
      const uploadPath = `${attachmentBasePath}/${uniqueFileName}`;

      console.log('📦 [UniversalEditor] 准备上传到路径:', uploadPath);

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
      console.log('✅ [UniversalEditor] 图片上传成功:', {
        originalFileName: file.name,
        uniqueFileName,
        uploadPath,
        result,
      });

      // 返回相对路径
      return `${attachmentBasePath.split('/').pop()}/${uniqueFileName}`;
    } catch (error) {
      console.error('❌ [UniversalEditor] 图片上传失败:', error);
      throw error;
    }
  };

  // 处理文件上传
  const handleFileUpload = async (files: FileList) => {
    if (files.length === 0 || !enableAttachments) return;

    setIsUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // 生成唯一文件名，避免冲突
        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}_${file.name}`;

        // 构建上传路径
        const uploadPath = `${attachmentBasePath}/${uniqueFileName}`;

        console.log('📦 [UniversalEditor] 上传附件到路径:', uploadPath);

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
        console.log('✅ [UniversalEditor] 附件上传成功:', {
          originalFileName: file.name,
          uniqueFileName,
          uploadPath,
          result,
        });

        // 检测文件类型
        const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);

        // 返回附件信息（使用相对路径）
        const attachment: Attachment = {
          filename: file.name,
          path: `${attachmentBasePath.split('/').pop()}/${uniqueFileName}`, // 相对路径
          contentType: file.type,
          size: file.size,
          isImage,
        };

        return attachment;
      });

      const uploadedAttachments = await Promise.all(uploadPromises);
      const newAttachments = [...attachments, ...uploadedAttachments];
      handleAttachmentsChange(newAttachments);
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
    if (!enableDragDrop) return;
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleEditorDragLeave = (e: React.DragEvent) => {
    if (!enableDragDrop) return;
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleEditorDrop = (e: React.DragEvent) => {
    if (!enableDragDrop) return;
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  // 上传按钮点击处理
  const handleUploadButtonClick = () => {
    if (!enableAttachments) return;

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
    const newAttachments = attachments.filter((_, i) => i !== index);
    handleAttachmentsChange(newAttachments);
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

    if (!onSave) return;

    try {
      console.log('🚀 [UniversalEditor] 开始保存...');

      // 处理内联 base64 图片
      const processedContent = await processInlineImages(content.trim());

      console.log('📝 [UniversalEditor] 提交处理后的内容:', {
        originalLength: content.trim().length,
        processedLength: processedContent.length,
        hasImages: processedContent.includes('!['),
      });

      await onSave({
        content: processedContent,
        isPublic: enablePublicToggle ? isPublic : undefined,
        attachments: enableAttachments ? attachments : undefined,
      });
    } catch (error) {
      console.error('❌ [UniversalEditor] 提交失败:', error);
      setErrorDialog({
        show: true,
        title: '保存失败',
        message: `处理内容时发生错误: ${error.message}`,
      });
    }
  };

  return (
    <div className={`w-full h-full flex flex-col ${className}`} data-testid={dataTestId}>
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

      <div className="card bg-base-100 shadow-xl flex-1 flex flex-col min-h-0" data-testid={`${dataTestId}-card`}>
        {/* 头部 */}
        <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-base-300">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-medium">{title}</h2>
            {initialShowPreview && (
              <div className="flex items-center space-x-1 sm:space-x-2">
                {/* 编辑模式按钮组 */}
                <div className="btn-group">
                  <button
                    type="button"
                    onClick={() => setEditorMode('wysiwyg')}
                    className={`btn btn-xs ${editorMode === 'wysiwyg' ? 'btn-primary' : 'btn-outline'}`}
                    data-testid="wysiwyg-button"
                  >
                    富文本
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('source')}
                    className={`btn btn-xs ${editorMode === 'source' ? 'btn-primary' : 'btn-outline'}`}
                    data-testid="source-button"
                  >
                    源码
                  </button>
                </div>
                {/* 预览按钮 */}
                <button
                  type="button"
                  onClick={() => setEditorMode(editorMode === 'preview' ? 'wysiwyg' : 'preview')}
                  className={`btn btn-xs ${editorMode === 'preview' ? 'btn-primary' : 'btn-outline'}`}
                  data-testid="preview-button"
                >
                  预览
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 编辑器内容 */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 flex flex-col flex-1 min-h-0">
            {/* 内容输入 */}
            <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
              {editorMode === 'preview' ? (
                <div className="flex-1 p-2 sm:p-3 border border-base-300 rounded-md bg-base-200 overflow-auto">
                  <div className="prose prose-sm max-w-none">
                    <SimpleMarkdownPreview content={content} />
                  </div>
                </div>
              ) : editorMode === 'source' ? (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <SourceEditor
                    content={content}
                    onChange={handleContentChange}
                    placeholder={placeholder}
                    className="w-full h-full"
                    data-testid="content-input"
                    onImageUpload={handleImageUpload}
                  />
                </div>
              ) : (
                <div
                  className={`relative flex flex-col flex-1 min-h-0 overflow-hidden ${isDragOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}
                  onDragOver={handleEditorDragOver}
                  onDragLeave={handleEditorDragLeave}
                  onDrop={handleEditorDrop}
                >
                  <MilkdownEditor
                    content={content}
                    onChange={handleContentChange}
                    placeholder={placeholder}
                    className="w-full flex-1 min-h-0"
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
            {enableAttachments && attachments.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-base-content/70">附件</label>
                <AttachmentGrid
                  attachments={attachments}
                  onRemove={handleRemoveAttachment}
                  editable={editorMode !== 'preview'}
                />
              </div>
            )}

            {/* 工具栏和按钮 */}
            <div className="flex-shrink-0 flex items-center justify-between">
              {/* 快速插入工具栏 */}
              {editorMode !== 'preview' && (
                <div className="flex items-center space-x-1">
                  <div className="tooltip tooltip-top mr-2" data-tip="支持 Markdown 格式。支持拖拽、粘贴上传文件">
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
                  {enableAttachments && (
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
                  )}
                </div>
              )}

              {/* 右侧按钮组 */}
              <div className="flex items-center space-x-2">
                {/* 公开/私有切换 */}
                {enablePublicToggle && (
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-base-content/60">{isPublic ? '公开' : '私有'}</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-xs toggle-primary"
                      checked={isPublic}
                      onChange={(e) => handlePublicChange(e.target.checked)}
                      data-testid="public-toggle"
                    />
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex space-x-1">
                  {onCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="btn btn-xs btn-outline"
                      data-testid="cancel-button"
                    >
                      取消
                    </button>
                  )}
                  {onSave && (
                    <button
                      type="submit"
                      disabled={isSaving || isUploading}
                      className="btn btn-xs btn-primary"
                      data-testid="save-button"
                    >
                      {isSaving ? (
                        <>
                          <span className="loading loading-spinner loading-xs"></span>
                          保存中...
                        </>
                      ) : (
                        '保存'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
