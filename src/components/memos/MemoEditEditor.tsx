import { trpc } from '~/lib/trpc-client';
import { UniversalEditor } from '../common/UniversalEditor';
import { type Attachment } from './AttachmentGrid';

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
      console.error('更新 Memo 失败:', error);
    },
  });

  // 处理保存
  const handleSave = async (data: { content: string; isPublic?: boolean; attachments?: Attachment[] }) => {
    console.log('� [MemoEditEditor] 开始更新 Memo...');

    updateMemoMutation.mutate({
      id: memoId,
      content: data.content,
      isPublic: data.isPublic ?? false,
      attachments: data.attachments ?? [],
    });
  };

  return (
    <UniversalEditor
      initialContent={initialContent}
      initialIsPublic={initialIsPublic}
      initialAttachments={initialAttachments}
      onSave={handleSave}
      onCancel={onCancel}
      isSaving={updateMemoMutation.isPending}
      title="编辑 Memo"
      placeholder="编辑你的想法..."
      attachmentBasePath="Memos/assets"
      enableAttachments={true}
      enablePublicToggle={true}
      showPreview={true}
      enableDragDrop={true}
      data-testid="memo-edit-editor"
    />
  );
}
