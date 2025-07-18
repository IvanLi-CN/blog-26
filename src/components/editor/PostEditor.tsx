import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc';
import { DirectoryTree } from './DirectoryTree';
import { MarkdownEditor } from './MarkdownEditor';

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
    <div className="flex h-full">
      <div className="w-1/4 border-r overflow-y-auto">
        <DirectoryTree onSelectFile={setFilePath} onCreateFile={() => {}} />
      </div>
      <div className="w-3/4 flex flex-col">
        <div className="flex-1">
          <MarkdownEditor content={content} onChange={setContent} filePath={filePath} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}
