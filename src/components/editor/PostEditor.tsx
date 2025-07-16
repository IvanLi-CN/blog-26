import yaml from 'js-yaml';
import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import { DirectoryTree } from './DirectoryTree';
import { MarkdownEditor } from './MarkdownEditor';
import { type PostMetadata } from './PostMetadataForm';

interface PostEditorProps {
  postId?: string;
  isNewPost: boolean;
}

export function PostEditor({ postId, isNewPost }: PostEditorProps) {
  const [fullContent, setFullContent] = useState('');
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
  const [showDirectoryTree, setShowDirectoryTree] = useState(true);
  const [originalPostPath, setOriginalPostPath] = useState<string | null>(null);
  const [currentEditingFile, setCurrentEditingFile] = useState<string | null>(postId || null);
  const [clientRouteFileId, setClientRouteFileId] = useState<string | null>(null);

  // 客户端路由加载文件内容
  const loadFileContent = (filePath: string) => {
    setClientRouteFileId(filePath);
    setCurrentEditingFile(filePath);
  };

  // 解析frontmatter和内容
  const parseFrontmatter = (content: string): { frontmatter: PostMetadata; body: string } => {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: {
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
        },
        body: content,
      };
    }

    const frontmatterText = match[1];
    const body = match[2];

    try {
      const parsedFrontmatter = (yaml.load(frontmatterText) as Record<string, any>) || {};

      return {
        frontmatter: {
          title: parsedFrontmatter.title || '',
          description: parsedFrontmatter.description || '',
          publishDate: parsedFrontmatter.publishDate || new Date().toISOString(),
          updateDate: parsedFrontmatter.updateDate,
          draft: parsedFrontmatter.draft !== false,
          public: parsedFrontmatter.public !== false,
          tags: Array.isArray(parsedFrontmatter.tags) ? parsedFrontmatter.tags : [],
          category: parsedFrontmatter.category || '',
          author: parsedFrontmatter.author || '',
          image: parsedFrontmatter.image || '',
          excerpt: parsedFrontmatter.excerpt || '',
          slug: parsedFrontmatter.slug || '',
        },
        body: body,
      };
    } catch (error) {
      console.warn('Failed to parse frontmatter as YAML:', error);
      return {
        frontmatter: {
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
        },
        body: content,
      };
    }
  };

  // 序列化frontmatter和内容
  const serializeFrontmatter = (frontmatter: PostMetadata, body: string): string => {
    const yamlContent = yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });

    return `---\n${yamlContent}---\n\n${body}`;
  };

  // 获取现有文章数据 - 支持客户端路由
  const effectiveFileId = clientRouteFileId || postId;
  const {
    data: post,
    isLoading,
    error,
    refetch,
  } = trpc.posts.getById.useQuery(
    { id: effectiveFileId! },
    {
      enabled: !isNewPost && !!effectiveFileId,
      retry: false,
    }
  );

  // 监听浏览器前进/后退按钮
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const fileId = urlParams.get('id');
      if (fileId && fileId !== effectiveFileId) {
        loadFileContent(fileId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [effectiveFileId]);

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

  // 创建文件 mutation
  const createFileMutation = trpc.posts.createFile.useMutation({
    onSuccess: (_, variables) => {
      setSaveStatus('saved');
      // 创建成功后直接在当前界面打开新文件（客户端路由）
      setCurrentEditingFile(variables.path);
      // 更新URL但不刷新页面
      const newUrl = `/admin/posts/edit?id=${encodeURIComponent(variables.path)}`;
      window.history.pushState({}, '', newUrl);
      // 客户端路由：直接加载新文件内容
      loadFileContent(variables.path);
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
      // 记录原始文章路径
      setOriginalPostPath(post.id);

      // 构建完整的markdown内容（包含frontmatter）
      const fullMarkdownContent = serializeFrontmatter(
        {
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
        },
        post.body
      );

      setFullContent(fullMarkdownContent);

      setMetadata({
        title: post.data.title || '',
        description: post.data.description || '',
        publishDate: post.data.publishDate || new Date().toISOString(),
        updateDate: post.data.updateDate,
        draft: post.data.draft !== false,
        public: post.data.public !== false,
        tags: Array.isArray(post.data.tags) ? post.data.tags : [],
        category: post.data.category || '',
        author: post.data.author || '',
        image: post.data.image || '',
        excerpt: post.data.excerpt || '',
        slug: post.data.slug || '',
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

  // 处理内容变化，同时更新metadata
  const handleContentChange = (newContent: string) => {
    setFullContent(newContent);

    // 解析新的frontmatter
    const { frontmatter } = parseFrontmatter(newContent);
    setMetadata(frontmatter);
  };

  const handleSave = async () => {
    // 从完整内容中解析frontmatter和body
    const { frontmatter, body } = parseFrontmatter(fullContent);
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
        // 新建文章：根据当前编辑文件路径确定collection
        const currentPath = currentEditingFile || '/';
        let collection: 'post' | 'notes' | 'local-notes' | 'projects' = 'post';
        if (currentPath.includes('/notes/')) {
          collection = 'notes';
        } else if (currentPath.includes('/local-notes/')) {
          collection = 'local-notes';
        } else if (currentPath.includes('/Project/') || currentPath === '/Project') {
          collection = 'projects';
        }

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
          body: body,
          collection: collection,
          customPath: currentPath,
        });
      } else {
        // 编辑文章：使用原始路径更新
        await updatePostMutation.mutateAsync({
          id: originalPostPath || postId!,
          frontmatter: {
            title: frontmatter.title,
            description: frontmatter.description,
            publishDate: frontmatter.publishDate,
            updateDate: new Date().toISOString(), // 自动更新修改时间
            draft: frontmatter.draft,
            public: frontmatter.public,
            tags: frontmatter.tags,
            category: frontmatter.category,
            author: frontmatter.author,
            image: frontmatter.image,
            excerpt: frontmatter.excerpt,
            slug: frontmatter.slug,
          },
          body: body,
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
  }, [fullContent]);

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
    <div className="h-full flex bg-white dark:bg-gray-800">
      {/* 左侧目录树面板 - 始终显示 */}
      {showDirectoryTree && (
        <div className="w-64 border-r border-gray-200 dark:border-gray-600 flex flex-col">
          <div className="flex items-center justify-between p-2 border-b bg-gray-50 dark:bg-gray-800">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">文件管理器</h3>
            <button
              onClick={() => setShowDirectoryTree(false)}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="隐藏文件管理器"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <DirectoryTree
              onSelectFile={(filePath) => {
                // 点击文件时在当前界面打开该文件（客户端路由）
                const newUrl = `/admin/posts/edit?id=${encodeURIComponent(filePath)}`;
                window.history.pushState({}, '', newUrl);
                loadFileContent(filePath);
              }}
              onCreateFile={async (filePath) => {
                // 创建新文件
                try {
                  await createFileMutation.mutateAsync({
                    path: filePath,
                    content: '',
                  });
                } catch (error) {
                  console.error('Failed to create file:', error);
                }
              }}
              selectedPath={currentEditingFile || postId || '/'}
              onRefresh={() => {
                // 刷新目录树后可能需要重新加载当前文件
                if (effectiveFileId) {
                  refetch();
                }
              }}
            />
          </div>
        </div>
      )}

      {/* 主编辑器区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 工具栏 - 显示文件管理器切换按钮和当前文件信息 */}
        {!showDirectoryTree && (
          <div className="flex items-center justify-between p-2 border-b bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowDirectoryTree(true)}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                显示文件管理器
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                当前文件: {currentEditingFile || postId || '新文件'}
              </span>
            </div>
            <a
              href="/admin/posts"
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              返回列表
            </a>
          </div>
        )}

        {/* 编辑器区域 */}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditor
            content={fullContent}
            onChange={handleContentChange}
            placeholder="开始写作你的文章内容..."
            className="h-full"
            filePath={postId}
            onSave={handleSave}
            isSaving={isSaving}
            saveStatus={saveStatus}
          />
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

          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            提示: 使用 Ctrl+S (或 Cmd+S) 快速保存
            {(currentEditingFile || postId) && ` | 文件路径: ${currentEditingFile || postId}`}
          </div>
        </div>
      </div>
    </div>
  );
}
