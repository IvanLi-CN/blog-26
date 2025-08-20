"use client";

/**
 * 文章通用编辑器组件
 *
 * 集成文章编辑的所有功能，包括多标签页、多种编辑模式等
 */

import { skipToken } from "@tanstack/react-query";
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

  // 判断文件类型
  const isNewFile = selectedPostId?.startsWith("__NEW__");
  const isWebDAVFile = selectedPostId?.startsWith("/");
  const isLocalFile =
    selectedPostId &&
    !selectedPostId.startsWith("/") &&
    !isNewFile &&
    (selectedPostId.includes("/") || selectedPostId.endsWith(".md"));
  const isDatabasePost = selectedPostId && !isWebDAVFile && !isLocalFile && !isNewFile;

  // 获取数据库文章数据
  const { data: post } = trpc.admin.posts.get.useQuery(
    selectedPostId && isDatabasePost ? { id: selectedPostId } : skipToken
  );

  // 获取 WebDAV 文件数据
  const [lastSaveTime, setLastSaveTime] = useState<number>(0);
  const shouldSkipReload = Date.now() - lastSaveTime < 2000; // 保存后2秒内不重载

  const { data: webdavFile } = trpc.admin.files.readFile.useQuery(
    selectedPostId ? { source: "webdav", path: selectedPostId } : { source: "webdav", path: "" },
    {
      enabled: !!selectedPostId && isWebDAVFile && !shouldSkipReload,
      refetchOnWindowFocus: false, // 避免窗口聚焦时重新获取
    }
  );

  // 获取本地文件数据
  const { data: localFile } = trpc.admin.files.readFile.useQuery(
    selectedPostId && isLocalFile ? { source: "local", path: selectedPostId } : skipToken
  );

  // 创建文章
  const createPostMutation = trpc.admin.posts.create.useMutation({
    onSuccess: (result) => {
      // 创建成功后打开新标签页
      openPostInTab(result.post.id, result.post.title, result.post.body, true);
      setTimeout(() => {
        onPostChange?.(result.post.id);
      }, 0);
    },
    onError: (error) => {
      console.error("创建文章失败:", error.message);
    },
  });

  // 更新文章
  const updatePostMutation = trpc.admin.posts.update.useMutation({
    onSuccess: () => {
      // 更新成功后标记为已保存
      setTabs((prev) =>
        prev.map((tab) => (tab.id === selectedPostId ? { ...tab, isDirty: false } : tab))
      );
    },
    onError: (error) => {
      console.error("更新文章失败:", error.message);
    },
  });

  // 写入文件
  const writeFileMutation = trpc.admin.files.writeFile.useMutation({
    onSuccess: () => {
      console.log("✅ [PostUniversalEditor] 文件保存成功");
    },
    onError: (error) => {
      console.error("❌ [PostUniversalEditor] 文件保存失败:", error.message);
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
    (fileId: string, fileName?: string) => {
      console.log("🔄 [PostUniversalEditor] 选择文件:", { fileId, fileName });

      // 检查是否已经在标签页中
      const existingTab = tabs.find((tab) => tab.id === fileId);
      if (existingTab) {
        setActiveTabId(fileId);
        setTimeout(() => {
          onPostChange?.(fileId);
        }, 0);
        return;
      }

      // 如果是 WebDAV 文件路径（以 / 开头），需要特殊处理
      if (fileId.startsWith("/")) {
        console.log("📁 [PostUniversalEditor] 检测到 WebDAV 文件路径:", fileId);
        // TODO: 实现 WebDAV 文件加载逻辑
        // 暂时使用文件路径作为 ID
        setTimeout(() => {
          onPostChange?.(fileId);
        }, 0);
        return;
      }

      // 如果不存在，则正常处理数据库文章
      setTimeout(() => {
        onPostChange?.(fileId);
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

  // 处理 WebDAV 文件数据加载
  useEffect(() => {
    if (webdavFile && selectedPostId && isWebDAVFile) {
      console.log("📁 [PostUniversalEditor] 加载 WebDAV 文件:", webdavFile);

      // 解析文件名作为标题
      const fileName = selectedPostId.split("/").pop() || "未命名文件";
      const title = fileName.replace(/\.md$/, "");

      setPostData((prev) => ({
        ...prev,
        [selectedPostId]: {
          id: selectedPostId,
          title: title,
          slug: selectedPostId.replace(/[^a-zA-Z0-9]/g, "-"),
          body: webdavFile.content,
          excerpt: "",
          type: "project", // WebDAV 文件默认为项目类型
          draft: false,
          public: true,
        },
      }));

      openPostInTab(selectedPostId, title, webdavFile.content);
    }
  }, [webdavFile, selectedPostId, isWebDAVFile, openPostInTab]);

  // 处理本地文件数据加载
  useEffect(() => {
    if (localFile && selectedPostId && isLocalFile) {
      console.log("📁 [PostUniversalEditor] 加载本地文件:", localFile);

      // 解析文件名作为标题
      const fileName = selectedPostId.split("/").pop() || "未命名文件";
      const title = fileName.replace(/\.md$/, "");

      setPostData((prev) => ({
        ...prev,
        [selectedPostId]: {
          id: selectedPostId,
          title: title,
          slug: selectedPostId.replace(/[^a-zA-Z0-9]/g, "-"),
          body: localFile.content,
          excerpt: "",
          type: selectedPostId.startsWith("posts/")
            ? "post"
            : selectedPostId.startsWith("projects/")
              ? "project"
              : selectedPostId.startsWith("memos/")
                ? "memo"
                : "post",
          draft: false,
          public: true,
        },
      }));

      openPostInTab(selectedPostId, title, localFile.content);
    }
  }, [localFile, selectedPostId, isLocalFile, openPostInTab]);

  // 处理新文件创建
  useEffect(() => {
    if (selectedPostId && isNewFile) {
      console.log("📝 [PostUniversalEditor] 创建新文件:", selectedPostId);

      // 移除 __NEW__ 前缀获取实际文件路径
      const actualFilePath = selectedPostId.replace("__NEW__", "");

      // 从文件路径中提取文件名（不包含目录）
      const fileName = actualFilePath.split("/").pop() || actualFilePath;
      const fileNameWithoutExt = fileName.replace(".md", "");

      // 生成友好的标题（将连字符和下划线替换为空格，并首字母大写）
      const title = fileNameWithoutExt
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      // 生成 slug（保持原始文件名格式，但移除扩展名）
      const slug = fileNameWithoutExt;

      // 创建新文件的默认内容
      const defaultContent = `---
title: "${title}"
slug: "${slug}"
publishDate: ${new Date().toISOString()}
draft: true
public: false
excerpt: ""
category: ""
tags: []
author: ""
---

# ${title}

开始写作您的文章...
`;

      // 在标签页中打开新文件
      openPostInTab(selectedPostId, title, defaultContent, true);
    }
  }, [selectedPostId, isNewFile, openPostInTab]);

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
      const processedContent = await processInlineImages(tab.content, tabId);

      console.log("📝 [PostUniversalEditor] 图片处理完成:", {
        originalLength: tab.content.length,
        processedLength: processedContent.length,
        hasImages: processedContent.includes("!["),
      });

      // 自动生成 slug
      const slug =
        data.slug ||
        (data.title || tab.title || "untitled")
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
          .replace(/^-+|-+$/g, "");

      // 根据文件类型选择保存方法
      const isNewFile = tabId.startsWith("__NEW__");
      const actualPath = isNewFile ? tabId.replace("__NEW__", "") : tabId;
      const isWebDAVFile = actualPath.startsWith("/");
      const isLocalFile =
        actualPath &&
        !actualPath.startsWith("/") &&
        (actualPath.includes("/") || actualPath.endsWith(".md"));

      if (isWebDAVFile) {
        // WebDAV 文件：使用文件写入 API
        await writeFileMutation.mutateAsync({
          source: "webdav",
          path: actualPath,
          content: processedContent,
        });
      } else if (isLocalFile) {
        // 本地文件：使用文件写入 API
        await writeFileMutation.mutateAsync({
          source: "local",
          path: actualPath,
          content: processedContent,
        });
      } else {
        // 数据库文章：使用文章更新 API
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
      }

      console.log("✅ [PostUniversalEditor] 保存成功");

      // 更新最后保存时间，防止立即重载
      setLastSaveTime(Date.now());

      // 如果是新文件，更新标签页 ID 移除 __NEW__ 前缀
      if (isNewFile) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, id: actualPath, isDirty: false, content: processedContent } : t
          )
        );
        // 更新 postData 的键
        setPostData((prev) => {
          const newData = { ...prev };
          newData[actualPath] = { ...newData[tabId], body: processedContent };
          delete newData[tabId];
          return newData;
        });
        // 更新选中的文章 ID
        onPostChange?.(actualPath);
      } else {
        // 更新标签页状态为已保存，并更新内容为处理后的内容
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, isDirty: false, content: processedContent } : t
          )
        );
        // 更新 postData 中的内容
        setPostData((prev) => ({
          ...prev,
          [tabId]: { ...prev[tabId], body: processedContent },
        }));
      }
    } catch (error) {
      console.error("❌ [PostUniversalEditor] 保存失败:", error);
    }
  };

  // 将API URL转换回相对路径格式
  const convertApiUrlsToRelativePaths = (content: string): string => {
    // 匹配 API URL 格式的图片路径
    const apiUrlRegex = /!\[([^\]]*)\]\(\/api\/files\/[^/]+\/(.+?)\)/g;

    return content.replace(apiUrlRegex, (_match, alt, relativePath) => {
      // 确保相对路径以 ./ 开头
      const normalizedPath = relativePath.startsWith("./") ? relativePath : `./${relativePath}`;
      console.log("🔄 [PostUniversalEditor] 转换API URL回相对路径:", {
        original: _match,
        converted: `![${alt}](${normalizedPath})`,
      });
      return `![${alt}](${normalizedPath})`;
    });
  };

  // 处理内联图片上传 - 从 UniversalEditor 复制过来
  const processInlineImages = async (content: string, tabId: string): Promise<string> => {
    // 首先将API URL转换回相对路径格式，避免第二次保存时路径错误
    const normalizedContent = convertApiUrlsToRelativePaths(content);

    console.log("🔍 [PostUniversalEditor] 检查内容中的 Base64 图片:", {
      contentLength: normalizedContent.length,
      contentPreview:
        normalizedContent.substring(0, 200) + (normalizedContent.length > 200 ? "..." : ""),
      hasDataImage: normalizedContent.includes("data:image"),
      hasEscapedDataImage: normalizedContent.includes("\\(data:image"),
    });

    // 先处理转义字符 - Milkdown 会转义 Markdown 语法
    const unescapedContent = normalizedContent
      .replace(/\\\[/g, "[") // 反转义 [
      .replace(/\\\]/g, "]") // 反转义 ]
      .replace(/\\\(/g, "(") // 反转义 (
      .replace(/\\\)/g, ")"); // 反转义 )

    console.log("🔧 [PostUniversalEditor] 反转义处理:", {
      originalLength: normalizedContent.length,
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

        // 根据当前文件源决定上传路径和方式
        const currentFileIsWebDAV = tabId.startsWith("/");
        const uploadPath = `assets/${filename}`;

        // 将 base64 转换为 Blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: `image/${imageType}` });

        let response: Response;

        if (currentFileIsWebDAV) {
          // WebDAV 文件：需要上传到 WebDAV 服务器
          console.log("🌐 [PostUniversalEditor] 上传图片到 WebDAV 服务器:", uploadPath);

          // 直接调用 WebDAV 服务器的 PUT 接口
          const webdavUrl = `${process.env.NEXT_PUBLIC_WEBDAV_URL || "http://localhost:8080"}/${uploadPath}`;
          response = await fetch(webdavUrl, {
            method: "PUT",
            headers: {
              "Content-Type": `image/${imageType}`,
            },
            body: blob,
          });
        } else {
          // 本地文件：上传到本地文件系统
          console.log("💾 [PostUniversalEditor] 上传图片到本地文件系统:", uploadPath);
          response = await fetch(`/api/files/local/${uploadPath}`, {
            method: "POST",
            headers: {
              "Content-Type": `image/${imageType}`,
            },
            body: blob,
          });
        }

        if (!response.ok) {
          throw new Error(`上传失败: ${response.status}`);
        }

        let result: unknown;
        if (currentFileIsWebDAV) {
          // WebDAV 服务器返回文本 "OK"
          const text = await response.text();
          result = { success: true, text };
          console.log("✅ [PostUniversalEditor] WebDAV 图片上传成功:", {
            uploadPath,
            response: text,
          });
        } else {
          // 本地 API 返回 JSON
          result = await response.json();
          console.log("✅ [PostUniversalEditor] 本地图片上传成功:", {
            uploadPath,
            result,
          });
        }

        // 替换内联图片为上传后的路径（使用相对路径）
        const imagePath = `./assets/${filename}`;
        const newImageMarkdown = `![${altText}](${imagePath})`;
        processedContent = processedContent.replace(fullMatch, newImageMarkdown);

        console.log("✅ [PostUniversalEditor] 内联图片处理成功:", {
          filename,
          imagePath,
          newMarkdown: newImageMarkdown,
        });
      } catch (error) {
        console.error("❌ [PostUniversalEditor] 内联图片处理失败:", error);
        // 抛出错误，不要静默处理
        throw new Error(`图片上传失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return processedContent;
  };

  // 创建新文章
  const _handleCreatePost = async () => {
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

  // 注意：如果需要暴露方法给父组件，应该使用 useImperativeHandle 和 forwardRef

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
          editorId={activeTab.id}
          initialContent={activeTab.content}
          onContentChange={(content) => handleContentChange(activeTab.id, content)}
          placeholder="开始写作您的文章..."
          attachmentBasePath="assets"
          articlePath={
            activeTab.id.startsWith("__NEW__") ? activeTab.id.replace("__NEW__", "") : activeTab.id
          }
          contentSource={activeTab.id.startsWith("/") ? "webdav" : "local"}
          mode={activeTab.mode}
          onModeChange={(mode) => handleModeChange(activeTab.id, mode)}
          className="h-full"
        />
      </div>
    </div>
  );
}
