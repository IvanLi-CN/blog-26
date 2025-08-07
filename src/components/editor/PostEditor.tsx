import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from '~/lib/trpc';
import { DirectoryTree } from './DirectoryTree';
import { PostUniversalEditor } from './PostUniversalEditor';

interface PostEditorProps {
  postId?: string;
  isNewPost: boolean;
}

interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  isDirty: boolean;
  isLoading: boolean;
  justLoaded?: boolean; // 标记内容刚刚加载完成，需要等待编辑器稳定
}

export function PostEditor({ postId: initialPostId, isNewPost: initialIsNewPost }: PostEditorProps) {
  // 从 URL 参数动态获取当前的 postId 和 isNewPost 状态
  const [urlPostId, setUrlPostId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('id');
    }
    return initialPostId || null;
  });

  const [isNewPost, setIsNewPost] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');
      return !id;
    }
    return initialIsNewPost;
  });

  // 使用动态的 postId
  const postId = urlPostId || initialPostId;

  // 初始化时如果有 postId，立即设置为活动标签页ID
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(postId || null);

  const updateMutation = trpc.posts.update.useMutation();

  // 获取文件内容的查询 - 为当前活动标签页加载内容
  const { data: post } = trpc.posts.getById.useQuery(
    { id: activeTabId! },
    {
      enabled: !!activeTabId && !isNewPost,
      // 每次 activeTabId 变化时重新获取数据
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    }
  );

  // 监听 URL 变化，更新 postId 和 isNewPost 状态
  useEffect(() => {
    const handleUrlChange = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const newPostId = urlParams.get('id');
      const newIsNewPost = !newPostId;

      setUrlPostId(newPostId);
      setIsNewPost(newIsNewPost);
    };

    // 监听 popstate 事件（浏览器前进后退）
    window.addEventListener('popstate', handleUrlChange);

    // 监听 pushstate 事件（程序化导航）
    const originalPushState = window.history.pushState;
    window.history.pushState = function (...args) {
      originalPushState.apply(window.history, args);
      handleUrlChange();
    };

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.history.pushState = originalPushState;
    };
  }, []);

  // 处理 postId 变化，确保 activeTabId 与 postId 同步
  useEffect(() => {
    if (postId && postId !== activeTabId) {
      setActiveTabId(postId);
    }
  }, [postId, activeTabId]);

  // 初始化时如果有 postId，创建第一个标签页
  useEffect(() => {
    if (postId && tabs.length === 0) {
      const fileName = postId.split('/').pop() || postId;
      const newTab: EditorTab = {
        id: postId,
        filePath: postId,
        fileName,
        content: '',
        isDirty: false,
        isLoading: !isNewPost, // 新文章不需要加载
      };
      setTabs([newTab]);
    }
  }, [postId, tabs.length, isNewPost]);

  // 当获取到文章内容时更新标签页
  useEffect(() => {
    if (post && activeTabId) {
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === activeTabId
            ? {
                ...tab,
                content: post.fullContent || '',
                isLoading: false,
                isDirty: false,
                // 添加一个标记，表示内容刚刚加载完成，需要等待编辑器稳定
                justLoaded: true,
              }
            : tab
        )
      );

      // 给编辑器一些时间来稳定内容，然后移除 justLoaded 标记
      setTimeout(() => {
        setTabs((prevTabs) => prevTabs.map((tab) => (tab.id === activeTabId ? { ...tab, justLoaded: false } : tab)));
      }, 1000); // 1秒后开始检测用户编辑
    }
  }, [post, activeTabId]);

  // 当 activeTabId 变化时，确保对应的标签页存在且处于加载状态
  useEffect(() => {
    if (activeTabId && tabs.length > 0) {
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      if (activeTab && !activeTab.isLoading && !activeTab.content) {
        // 如果标签页存在但没有内容且不在加载状态，重新设置为加载状态
        setTabs((prevTabs) => prevTabs.map((tab) => (tab.id === activeTabId ? { ...tab, isLoading: true } : tab)));
      }
    }
  }, [activeTabId, tabs]);

  // 处理文件选择
  const handleSelectFile = useCallback(
    (filePath: string) => {
      // 检查是否已经打开了这个文件
      const existingTab = tabs.find((tab) => tab.filePath === filePath);
      if (existingTab) {
        setActiveTabId(existingTab.id);

        // 如果标签页没有内容，重新设置为加载状态
        if (!existingTab.content) {
          setTabs((prevTabs) => prevTabs.map((tab) => (tab.id === existingTab.id ? { ...tab, isLoading: true } : tab)));
        }

        // 更新 URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('id', existingTab.filePath);
        window.history.pushState({}, '', newUrl.toString());
        return;
      }

      // 创建新标签页
      const fileName = filePath.split('/').pop() || filePath;
      const newTab: EditorTab = {
        id: filePath,
        filePath,
        fileName,
        content: '',
        isDirty: false,
        isLoading: true, // 新打开的文件需要加载内容
      };

      setTabs((prevTabs) => [...prevTabs, newTab]);
      setActiveTabId(filePath);

      // 更新 URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('id', filePath);
      window.history.pushState({}, '', newUrl.toString());
    },
    [tabs]
  );

  // 处理标签页关闭
  const handleCloseTab = useCallback(
    (tabId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();

      const tabToClose = tabs.find((tab) => tab.id === tabId);
      if (tabToClose?.isDirty) {
        const confirmed = window.confirm(`文件 "${tabToClose.fileName}" 有未保存的更改，确定要关闭吗？`);
        if (!confirmed) return;
      }

      setTabs((prevTabs) => {
        const newTabs = prevTabs.filter((tab) => tab.id !== tabId);

        // 如果关闭的是当前活动标签页，切换到其他标签页
        if (activeTabId === tabId) {
          if (newTabs.length > 0) {
            const currentIndex = prevTabs.findIndex((tab) => tab.id === tabId);
            const nextTab = newTabs[Math.min(currentIndex, newTabs.length - 1)];
            setActiveTabId(nextTab.id);

            // 更新 URL
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('id', nextTab.filePath);
            window.history.pushState({}, '', newUrl.toString());
          } else {
            setActiveTabId(null);

            // 如果没有标签页了，清除 URL 中的 id 参数
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('id');
            window.history.pushState({}, '', newUrl.toString());
          }
        }

        return newTabs;
      });
    },
    [tabs, activeTabId]
  );

  // 处理标签页切换
  const handleTabSwitch = useCallback((tabId: string) => {
    setActiveTabId(tabId);

    // 标记目标标签页为加载状态，确保内容会被重新加载
    setTabs((prevTabs) => prevTabs.map((tab) => (tab.id === tabId ? { ...tab, isLoading: true } : tab)));

    // 更新 URL
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', tabId);
    window.history.pushState({}, '', newUrl.toString());
  }, []);

  // 使用 ref 来避免 handleContentChange 函数引用变化导致编辑器重新创建
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // 处理内容变化
  const handleContentChange = useCallback((content: string) => {
    const currentActiveTabId = activeTabIdRef.current;
    if (!currentActiveTabId) return;

    setTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.id === currentActiveTabId) {
          // 区分程序加载和用户编辑：
          // 1. 如果标签页正在加载 → 这是程序加载，不标记为 dirty
          // 2. 如果标签页刚刚加载完成（justLoaded=true）→ 这是编辑器稳定过程，不标记为 dirty
          // 3. 如果标签页已稳定且内容有任何变化 → 这是用户编辑，标记为 dirty
          const isUserEdit = !tab.isLoading && !tab.justLoaded && tab.content !== content;

          const newIsDirty = tab.isDirty || isUserEdit; // 一旦标记为 dirty，就保持 dirty 状态

          // 调试日志（仅在用户编辑时输出）
          if (isUserEdit) {
            console.log('🔄 [PostEditor] 检测到用户编辑:', {
              tabId: tab.id,
              oldLength: tab.content.length,
              newLength: content.length,
              isUserEdit,
              newIsDirty,
            });
          }

          return {
            ...tab,
            content,
            isDirty: newIsDirty,
          };
        }
        return tab;
      })
    );
  }, []); // 移除 activeTabId 依赖，使用 ref 代替

  // 处理保存
  const handleSave = useCallback(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab) return;

    updateMutation.mutate(
      { id: activeTab.filePath, content: activeTab.content },
      {
        onSuccess: () => {
          setTabs((prevTabs) => prevTabs.map((tab) => (tab.id === activeTabId ? { ...tab, isDirty: false } : tab)));
        },
      }
    );
  }, [activeTabId, tabs, updateMutation]);

  // 页面卸载前检查未保存的更改
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnsavedChanges = tabs.some((tab) => tab.isDirty);
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '有未保存的更改，确定要离开吗？';
        return '有未保存的更改，确定要离开吗？';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-1/4 border-r overflow-y-auto">
        <DirectoryTree
          onSelectFile={handleSelectFile}
          onCreateFile={() => {}}
          selectedPath={activeTabId || undefined}
        />
      </div>
      <div className="w-3/4 flex flex-col min-h-0">
        {/* 标签页栏 */}
        {tabs.length > 0 && (
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
            <div className="flex overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`group flex items-center px-3 py-2 border-r border-gray-200 dark:border-gray-700 cursor-pointer transition-colors min-w-0 max-w-48 ${
                    activeTabId === tab.id
                      ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => handleTabSwitch(tab.id)}
                >
                  {/* 文件图标 */}
                  <span className="mr-2 text-blue-500 dark:text-blue-400 flex-shrink-0">📄</span>

                  {/* 文件名 */}
                  <span className="text-sm truncate flex-1" title={tab.fileName}>
                    {tab.fileName}
                  </span>

                  {/* 未保存标识 */}
                  {tab.isDirty && (
                    <span
                      className="ml-1 text-orange-500 dark:text-orange-400 text-xs flex-shrink-0"
                      title="未保存的更改"
                    >
                      ●
                    </span>
                  )}

                  {/* 关闭按钮 */}
                  <button
                    className="ml-2 w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    title="关闭标签页"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 编辑器区域 */}
        {activeTab ? (
          <PostUniversalEditor
            key={activeTab.id} // 添加 key 强制重新渲染
            postId={activeTab.filePath}
            initialContent={activeTab.content}
            onContentChange={handleContentChange}
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
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-4">📝</div>
              <p>从左侧文件管理器选择一个文件开始编辑</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
