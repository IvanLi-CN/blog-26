import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc';
import { DirectoryTree } from './DirectoryTree';
import { PostUniversalEditor } from './PostUniversalEditor';

interface PostEditorProps {
  postId?: string;
  isNewPost: boolean;
}

export function PostEditor({ postId, isNewPost }: PostEditorProps) {
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState<string | undefined>(postId);

  const { data: post } = trpc.posts.getById.useQuery({ id: filePath! }, { enabled: !!filePath && !isNewPost });

  const updateMutation = trpc.posts.update.useMutation();

  useEffect(() => {
    if (post) {
      setContent(post.fullContent);
    }
  }, [post]);

  const handleSave = () => {
    if (filePath) {
      updateMutation.mutate({ id: filePath, content });
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="w-1/4 border-r overflow-y-auto">
        <DirectoryTree onSelectFile={setFilePath} onCreateFile={() => {}} selectedPath={filePath} />
      </div>
      <div className="w-3/4 flex flex-col min-h-0">
        <PostUniversalEditor
          postId={filePath}
          initialContent={content}
          onContentChange={setContent}
          onSave={handleSave}
          isSaving={updateMutation.isPending}
          saveStatus={
            updateMutation.isPending
              ? 'saving'
              : updateMutation.isSuccess
                ? 'saved'
                : updateMutation.isError
                  ? 'error'
                  : 'idle'
          }
        />
      </div>
    </div>
  );
}
