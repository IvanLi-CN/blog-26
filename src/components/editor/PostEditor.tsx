import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { MarkdownEditor } from './MarkdownEditor';
import { type PostMetadata, PostMetadataForm } from './PostMetadataForm';

interface PostEditorProps {
  postId?: string;
  isNewPost: boolean;
}

export function PostEditor({ postId, isNewPost }: PostEditorProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'metadata'>('content');
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState<PostMetadata>({
    title: '',
    description: '',
    publishDate: new Date().toISOString(),
    draft: true,
    public: true,
    tags: [],
    category: '',
    author: '',
    image: '',
    excerpt: '',
    slug: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // 获取现有文章数据
  const {
    data: post,
    isLoading,
    error,
  } = trpc.posts.getById.useQuery(
    { id: postId! },
    {
      enabled: !isNewPost && !!postId,
      retry: false,
    }
  );

  // 创建文章 mutation
  const createPostMutation = trpc.posts.create.useMutation({
    onSuccess: () => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: (error) => {
      setSaveStatus('error');
      setErrorMessage(error.message);
      setTimeout(() => setSaveStatus('idle'), 5000);
    },
  });

  // 更新文章 mutation
  const updatePostMutation = trpc.posts.update.useMutation({
    onSuccess: () => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: (error) => {
      setSaveStatus('error');
      setErrorMessage(error.message);
      setTimeout(() => setSaveStatus('idle'), 5000);
    },
  });

  // 加载现有文章数据
  useEffect(() => {
    if (post) {
      setContent(post.body);
      setMetadata({
        title: post.data.title || '',
        description: post.data.description || '',
        publishDate: post.data.publishDate || new Date().toISOString(),
        updateDate: post.data.updateDate,
        draft: post.data.draft ?? true,
        public: post.data.public ?? true,
        tags: post.data.tags || [],
        category: post.data.category || '',
        author: post.data.author || '',
        image: post.data.image || '',
        excerpt: post.data.excerpt || '',
        slug: post.data.slug || post.slug,
      });
    }
  }, [post]);

  // 自动生成 slug
  useEffect(() => {
    if (isNewPost && metadata.title && !metadata.slug) {
      const generatedSlug = metadata.title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setMetadata((prev) => ({ ...prev, slug: generatedSlug }));
    }
  }, [metadata.title, isNewPost, metadata.slug]);

  const handleSave = async () => {
    if (!metadata.title.trim()) {
      setErrorMessage('标题不能为空');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return;
    }

    if (isNewPost && !metadata.slug?.trim()) {
      setErrorMessage('Slug 不能为空');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return;
    }

    setIsSaving(true);
    setSaveStatus('saving');

    try {
      if (isNewPost) {
        await createPostMutation.mutateAsync({
          slug: metadata.slug!,
          frontmatter: {
            title: metadata.title,
            description: metadata.description,
            publishDate: metadata.publishDate,
            updateDate: metadata.updateDate,
            draft: metadata.draft,
            public: metadata.public,
            tags: metadata.tags,
            category: metadata.category,
            author: metadata.author,
            image: metadata.image,
            excerpt: metadata.excerpt,
            slug: metadata.slug,
          },
          body: content,
          collection: 'post',
        });
      } else {
        await updatePostMutation.mutateAsync({
          id: postId!,
          frontmatter: {
            title: metadata.title,
            description: metadata.description,
            publishDate: metadata.publishDate,
            updateDate: new Date().toISOString(), // 自动更新修改时间
            draft: metadata.draft,
            public: metadata.public,
            tags: metadata.tags,
            category: metadata.category,
            author: metadata.author,
            image: metadata.image,
            excerpt: metadata.excerpt,
            slug: metadata.slug,
          },
          body: content,
        });
      }
    } catch (_error) {
      // Error handling is done in mutation callbacks
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [metadata, content]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载文章数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">加载失败</h3>
            <div className="mt-2 text-sm text-red-700 dark:text-red-300">{error.message}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
      {/* 标签页导航 */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8 px-6">
          <button
            onClick={() => setActiveTab('content')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'content'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            内容编辑
          </button>
          <button
            onClick={() => setActiveTab('metadata')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'metadata'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            文章信息
          </button>
        </nav>
      </div>

      {/* 内容区域 */}
      <div className="p-6">
        {activeTab === 'content' ? (
          <MarkdownEditor
            content={content}
            onChange={setContent}
            placeholder="开始写作..."
            className="min-h-[500px]"
            filePath={postId}
          />
        ) : (
          <PostMetadataForm metadata={metadata} onChange={setMetadata} />
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {saveStatus === 'saving' && <span className="text-sm text-gray-600 dark:text-gray-400">保存中...</span>}
            {saveStatus === 'saved' && <span className="text-sm text-green-600 dark:text-green-400">已保存</span>}
            {saveStatus === 'error' && (
              <span className="text-sm text-red-600 dark:text-red-400">保存失败: {errorMessage}</span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">提示: 使用 Ctrl+S (或 Cmd+S) 快速保存</div>
      </div>
    </div>
  );
}
