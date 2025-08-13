"use client";

/**
 * 文章通用编辑器组件
 *
 * 集成文章编辑的所有功能，包括多标签页、多种编辑模式等
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { trpc } from "../../lib/trpc";
import { UniversalEditor } from "./UniversalEditor";

// 编辑器模式类型
type EditorMode = "wysiwyg" | "source" | "preview";

// 编辑器标签页类型
interface EditorTab {
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
  mode: EditorMode;
}

interface PostUniversalEditorProps {
  /** 当前选中的文章 ID */
  selectedPostId?: string;
  /** 文章选择变化回调 */
  onPostChange?: (postId: string) => void;
}

interface PostData {
  id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  type: string;
  draft: boolean;
  public: boolean;
}

export function PostUniversalEditor({ selectedPostId, onPostChange }: PostUniversalEditorProps) {
  const _router = useRouter();
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [postData, setPostData] = useState<Record<string, PostData>>({});

  // 获取文章数据
  const { data: post } = trpc.admin.posts.get.useQuery(
    { id: selectedPostId! },
    { enabled: !!selectedPostId }
  );

  // 创建文章
  const createPostMutation = trpc.admin.posts.create.useMutation({
    onSuccess: (result) => {
      // 创建成功后打开新标签页
      openPostInTab(result.id, result.title, result.body, true);
      setTimeout(() => {
        onPostChange?.(result.id);
      }, 0);
    },
    onError: (error) => {
      console.error("创建文章失败:", error.message);
    },
  });

  // 更新文章
  const updatePostMutation = trpc.admin.posts.update.useMutation({
    onSuccess: (result) => {
      // 更新成功后标记为已保存
      setTabs((prev) =>
        prev.map((tab) => (tab.id === result.id ? { ...tab, isDirty: false } : tab))
      );
    },
    onError: (error) => {
      console.error("更新文章失败:", error.message);
    },
  });

  // 在标签页中打开文章
  const openPostInTab = useCallback(
    (postId: string, title: string, content: string, isNew = false) => {
      setTabs((prev) => {
        // 检查是否已经打开
        const existingTab = prev.find((tab) => tab.id === postId);
        if (existingTab) {
          setActiveTabId(postId);
          return prev;
        }

        // 创建新标签页
        const newTab: EditorTab = {
          id: postId,
          title: title || "未命名文章",
          content,
          isDirty: isNew,
          mode: "wysiwyg",
        };

        const newTabs = [...prev, newTab];
        setActiveTabId(postId);
        return newTabs;
      });
    },
    []
  );

  // 防止重复打开相同文章
  const _handleFileSelect = useCallback(
    (postId: string) => {
      // 检查是否已经在标签页中
      const existingTab = tabs.find((tab) => tab.id === postId);
      if (existingTab) {
        setActiveTabId(postId);
        setTimeout(() => {
          onPostChange?.(postId);
        }, 0);
        return;
      }

      // 如果不存在，则正常处理
      setTimeout(() => {
        onPostChange?.(postId);
      }, 0);
    },
    [tabs, onPostChange]
  );

  // 处理文章数据加载
  useEffect(() => {
    if (post && selectedPostId) {
      setPostData((prev) => ({
        ...prev,
        [selectedPostId]: {
          id: post.id,
          title: post.title,
          slug: post.slug,
          body: post.body,
          excerpt: post.excerpt || "",
          type: post.type || "post",
          draft: post.draft,
          public: post.public,
        },
      }));

      openPostInTab(post.id, post.title, post.body);
    }
  }, [post, selectedPostId, openPostInTab]);

  // 处理标签页切换
  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      // 使用 setTimeout 避免在渲染过程中更新父组件状态
      setTimeout(() => {
        onPostChange?.(tabId);
      }, 0);
    },
    [onPostChange]
  );

  // 处理标签页关闭
  const handleTabClose = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const newTabs = prev.filter((tab) => tab.id !== tabId);

        // 如果关闭的是当前活动标签页，切换到其他标签页
        if (tabId === activeTabId) {
          const currentIndex = prev.findIndex((tab) => tab.id === tabId);
          const nextTab = newTabs[currentIndex] || newTabs[currentIndex - 1] || newTabs[0];
          setActiveTabId(nextTab?.id || "");
          setTimeout(() => {
            onPostChange?.(nextTab?.id || "");
          }, 0);
        }

        return newTabs;
      });

      // 清理文章数据
      setPostData((prev) => {
        const newData = { ...prev };
        delete newData[tabId];
        return newData;
      });
    },
    [activeTabId, onPostChange]
  );

  // 处理内容变化
  const handleContentChange = (tabId: string, content: string) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, content, isDirty: true } : tab))
    );

    // 更新文章数据
    setPostData((prev) => ({
      ...prev,
      [tabId]: {
        ...prev[tabId],
        body: content,
      },
    }));
  };

  // 处理模式切换
  const handleModeChange = (tabId: string, mode: EditorMode) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, mode } : tab)));
  };

  // 处理保存
  const handleSave = async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    const data = postData[tabId];

    if (!tab || !data) return;

    try {
      console.log("🚀 [PostUniversalEditor] 开始保存文章:", {
        tabId,
        title: data.title,
        contentLength: tab.content.length,
      });

      // 处理内联 Base64 图片
      const processedContent = await processInlineImages(tab.content);

      console.log("📝 [PostUniversalEditor] 图片处理完成:", {
        originalLength: tab.content.length,
        processedLength: processedContent.length,
        hasImages: processedContent.includes("!["),
      });

      // 自动生成 slug
      const slug =
        data.slug ||
        data.title
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
          .replace(/^-+|-+$/g, "");

      // 自动生成摘要
      const excerpt = data.excerpt || processedContent.replace(/[#*`_~[\]()]/g, "").slice(0, 150);

      await updatePostMutation.mutateAsync({
        id: tabId,
        title: data.title,
        slug,
        body: processedContent, // 使用处理后的内容
        excerpt,
        type: data.type,
        draft: data.draft,
        public: data.public,
      });

      console.log("✅ [PostUniversalEditor] 文章保存成功");

      // 更新标签页状态为已保存
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, isDirty: false } : t)));
    } catch (error) {
      console.error("❌ [PostUniversalEditor] 保存失败:", error);
    }
  };

  // 处理内联图片上传 - 从 UniversalEditor 复制过来
  const processInlineImages = async (content: string): Promise<string> => {
    console.log("🔍 [PostUniversalEditor] 检查内容中的 Base64 图片:", {
      contentLength: content.length,
      contentPreview: content.substring(0, 200) + (content.length > 200 ? "..." : ""),
      hasDataImage: content.includes("data:image"),
      hasEscapedDataImage: content.includes("\\(data:image"),
    });

    // 先处理转义字符 - Milkdown 会转义 Markdown 语法
    const unescapedContent = content
      .replace(/\\\[/g, "[") // 反转义 [
      .replace(/\\\]/g, "]") // 反转义 ]
      .replace(/\\\(/g, "(") // 反转义 (
      .replace(/\\\)/g, ")"); // 反转义 )

    console.log("🔧 [PostUniversalEditor] 反转义处理:", {
      originalLength: content.length,
      unescapedLength: unescapedContent.length,
      hasDataImageAfterUnescape: unescapedContent.includes("data:image"),
      unescapedPreview:
        unescapedContent.substring(0, 200) + (unescapedContent.length > 200 ? "..." : ""),
    });

    const base64ImageRegex = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
    let processedContent = unescapedContent;
    const matches = Array.from(unescapedContent.matchAll(base64ImageRegex));

    console.log("🔍 [PostUniversalEditor] 正则匹配结果:", {
      matchCount: matches.length,
      matches: matches.map((m) => ({
        fullMatch: `${m[0].substring(0, 100)}...`,
        altText: m[1],
        imageType: m[2],
        base64Length: m[3]?.length || 0,
      })),
    });

    for (const match of matches) {
      const [fullMatch, altText, imageType, base64Data] = match;

      try {
        console.log("🖼️ [PostUniversalEditor] 处理内联图片:", {
          altText,
          imageType,
          base64Length: base64Data.length,
        });

        // 生成文件名
        const timestamp = Date.now();
        const filename = `inline-${timestamp}.${imageType}`;

        // 构建上传路径
        const uploadPath = `assets/${filename}`;

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
          method: "POST",
          headers: {
            "Content-Type": `image/${imageType}`,
          },
          body: blob,
        });

        if (!response.ok) {
          throw new Error(`上传失败: ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ [PostUniversalEditor] 内联图片上传成功:", {
          uploadPath,
          result,
        });

        // 替换内联图片为上传后的路径（使用相对路径）
        const imagePath = `assets/${filename}`;
        const newImageMarkdown = `![${altText}](${imagePath})`;
        processedContent = processedContent.replace(fullMatch, newImageMarkdown);

        console.log("✅ [PostUniversalEditor] 内联图片处理成功:", {
          filename,
          imagePath,
          newMarkdown: newImageMarkdown,
        });
      } catch (error) {
        console.error("❌ [PostUniversalEditor] 内联图片处理失败:", error);
        // 如果上传失败，保留原始的 base64 图片
      }
    }

    return processedContent;
  };

  // 创建新文章
  const handleCreatePost = async () => {
    try {
      await createPostMutation.mutateAsync({
        title: "新文章",
        slug: `new-post-${Date.now()}`,
        body: "# 新文章\n\n开始写作...",
        excerpt: "",
        type: "post",
        draft: true,
        public: true,
      });
    } catch (error) {
      console.error("创建文章失败:", error);
    }
  };

  // 暴露创建文章方法给父组件
  PostUniversalEditor.createPost = handleCreatePost;

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  if (!activeTab) {
    return (
      <div className="h-full flex flex-col">
        {/* 标签页栏 */}
        <div className="flex-shrink-0 border-b border-base-300">
          <div className="flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={`flex items-center px-4 py-2 border-r border-base-300 cursor-pointer flex-shrink-0 min-w-0 max-w-xs ${
                  tab.id === activeTabId ? "bg-base-200" : "hover:bg-base-100"
                }`}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className="mr-2 flex-shrink-0">{tab.isDirty ? "●" : ""}</span>
                <span className="text-sm truncate flex-1 min-w-0" title={tab.title}>
                  {tab.title}
                </span>
                <button
                  type="button"
                  className="ml-2 text-xs hover:text-error flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTabClose(tab.id);
                  }}
                >
                  ✕
                </button>
              </button>
            ))}
          </div>
        </div>

        {/* 空状态 */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">📝</div>
            <p className="text-lg mb-2">选择一个文件开始编辑</p>
            <p className="text-sm text-gray-500">或者创建一个新文件</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 标签页栏 */}
      <div className="flex-shrink-0 border-b border-base-300">
        <div className="flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`flex items-center px-4 py-2 border-r border-base-300 cursor-pointer flex-shrink-0 min-w-0 max-w-xs ${
                tab.id === activeTabId ? "bg-base-200" : "hover:bg-base-100"
              }`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="mr-2 flex-shrink-0">{tab.isDirty ? "●" : ""}</span>
              <span className="text-sm truncate flex-1 min-w-0" title={tab.title}>
                {tab.title}
              </span>
              <button
                type="button"
                className="ml-2 text-xs hover:text-error flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClose(tab.id);
                }}
              >
                ✕
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex-shrink-0 border-b border-base-300 p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn btn-sm ${activeTab.mode === "wysiwyg" ? "btn-active" : "btn-ghost"}`}
            onClick={() => handleModeChange(activeTab.id, "wysiwyg")}
          >
            📝
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab.mode === "source" ? "btn-active" : "btn-ghost"}`}
            onClick={() => handleModeChange(activeTab.id, "source")}
          >
            &lt;/&gt;
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab.mode === "preview" ? "btn-active" : "btn-ghost"}`}
            onClick={() => handleModeChange(activeTab.id, "preview")}
          >
            👁️
          </button>
          <div className="flex-1"></div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => handleSave(activeTab.id)}
          >
            💾
          </button>
        </div>
      </div>

      {/* 状态栏 */}
      <div className="flex-shrink-0 border-b border-base-300 px-4 py-1 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <div>
            模式:{" "}
            {activeTab.mode === "wysiwyg"
              ? "所见即所得"
              : activeTab.mode === "source"
                ? "源码"
                : "预览"}
          </div>
          <div className="flex items-center gap-4">
            <span>字符数: {activeTab.content.length}</span>
            <span>{activeTab.isDirty ? "未保存" : "已保存"}</span>
          </div>
        </div>
      </div>

      {/* 编辑器内容 */}
      <div className="flex-1 min-h-0">
        <UniversalEditor
          key={activeTab.id}
          initialContent={activeTab.content}
          onContentChange={(content) => handleContentChange(activeTab.id, content)}
          placeholder="开始写作您的文章..."
          attachmentBasePath="assets"
          mode={activeTab.mode}
          onModeChange={(mode) => handleModeChange(activeTab.id, mode)}
          className="h-full"
        />
      </div>
    </div>
  );
}
