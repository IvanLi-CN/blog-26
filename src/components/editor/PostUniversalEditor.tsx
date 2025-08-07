import { trpc } from '~/lib/trpc-client';
import { UniversalEditor } from '../common/UniversalEditor';

interface PostUniversalEditorProps {
  postId?: string;
  initialContent: string;
  onContentChange?: (content: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
}

export function PostUniversalEditor({
  postId,
  initialContent,
  onContentChange,
  onSave,
  isSaving = false,
  saveStatus = 'idle',
}: PostUniversalEditorProps) {
  // 获取 tRPC 工具
  const utils = trpc.useUtils();

  // 更新文章的 mutation
  const updatePostMutation = trpc.posts.update.useMutation({
    onSuccess: () => {
      // 刷新相关查询
      utils.posts.getAll.invalidate();
      if (postId) {
        utils.posts.getById.invalidate({ id: postId });
      }
    },
    onError: (error) => {
      console.error('更新文章失败:', error);
    },
  });

  // 处理保存
  const handleSave = async (data: { content: string; isPublic?: boolean; attachments?: any[] }) => {
    if (!postId) {
      console.error('无法保存：缺少文章 ID');
      return;
    }

    console.log('🚀 [PostUniversalEditor] 开始更新文章...');

    try {
      await updatePostMutation.mutateAsync({
        id: postId,
        content: data.content,
      });

      // 调用外部保存回调
      onSave?.();
    } catch (error) {
      console.error('❌ [PostUniversalEditor] 保存失败:', error);
      throw error;
    }
  };

  // 处理内容变化
  const handleContentChange = (content: string) => {
    onContentChange?.(content);
  };

  return (
    <UniversalEditor
      initialContent={initialContent}
      onContentChange={handleContentChange}
      onSave={handleSave}
      isSaving={isSaving || updatePostMutation.isPending}
      title="编辑文章"
      placeholder="开始编写你的文章..."
      attachmentBasePath="Project/assets"
      enableAttachments={true}
      enablePublicToggle={false} // 文章的公开状态通过 frontmatter 控制
      showPreview={true}
      enableDragDrop={true}
      className="h-full"
      data-testid="post-universal-editor"
    />
  );
}
