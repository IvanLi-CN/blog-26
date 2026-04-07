"use client";

/**
 * 文章通用编辑器组件
 *
 * 集成文章编辑的所有功能，包括多标签页、多种编辑模式等
 */

import { skipToken } from "@tanstack/react-query";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { inferContentTypeFromPath, parseMarkdownContent } from "../../lib/content-sources/utils";
import { processInlineImagesCompat } from "../../lib/image-processing";
import { trpc } from "../../lib/trpc";
import { generateContentUrl } from "../../lib/url-utils";
import {
  activeTabIdAtom,
  addTabAtom,
  autoExpandFoldersAtom,
  isClosingLastTabAtom,
  isRenamingAtom,
  markTabSavedAtom,
  removeTabAtom,
  setActiveTabIdAtom,
  tabsAtom,
  updateTabContentAtom,
  updateTabIdAtom,
  updateTabModeAtom,
} from "../../store/editorAtoms";
import Icon from "../ui/Icon";
// import { useAdvancedEditorState } from "./hooks/useEditorState"; // 移除旧的依赖
import type { EditorTab } from "./EditorStateContext";
import type { ContentSource } from "./PostEditorWrapper";
import { UniversalEditor } from "./UniversalEditor";

// 编辑器模式类型（保持兼容）
type EditorMode = "wysiwyg" | "source" | "preview";

interface PostUniversalEditorProps {
  /** 当前选中的内容源信息 */
  selectedContentSource?: ContentSource;
  /** 内容源变化回调 */
  onContentSourceChange?: (contentSource: ContentSource | undefined) => void;
  // 保留旧接口以防其他地方还在使用
  /** @deprecated 使用 selectedContentSource 替代 */
  selectedPostId?: string;
  /** @deprecated 使用 onContentSourceChange 替代 */
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

export function PostUniversalEditor({
  selectedContentSource,
  onContentSourceChange,
  selectedPostId,
  onPostChange,
}: PostUniversalEditorProps) {
  // const editorState = useAdvancedEditorState(); // 移除旧的依赖

  // 使用 Jotai 全局状态替换本地状态
  const [tabs] = useAtom(tabsAtom);
  const [activeTabId] = useAtom(activeTabIdAtom);
  const [isRenaming] = useAtom(isRenamingAtom);
  const [isClosingLastTab] = useAtom(isClosingLastTabAtom);
  const addTab = useSetAtom(addTabAtom);
  const setActiveTab = useSetAtom(setActiveTabIdAtom);
  const removeTab = useSetAtom(removeTabAtom);
  const updateTabContent = useSetAtom(updateTabContentAtom);
  const updateTabMode = useSetAtom(updateTabModeAtom);
  const markTabSaved = useSetAtom(markTabSavedAtom);
  const updateTabId = useSetAtom(updateTabIdAtom);
  const autoExpandFolders = useSetAtom(autoExpandFoldersAtom);

  const [postData, setPostData] = useState<Record<string, PostData>>({});

  // 兼容旧的 selectedPostId 参数
  const contentSource =
    selectedContentSource ||
    (selectedPostId ? convertLegacyIdToContentSource(selectedPostId) : undefined);

  // 基于明确的内容源信息判断类型，而不是基于 id 格式猜测
  const isNewFile = contentSource?.filePath?.startsWith("__NEW__");
  const isWebDAVFile = contentSource?.source === "webdav";
  const isLocalFile = contentSource?.source === "local";
  const isDatabasePost = contentSource?.source === "database";

  // 获取数据库文章数据
  const { data: post } = trpc.admin.posts.get.useQuery(
    contentSource && isDatabasePost ? { id: contentSource.filePath } : skipToken
  );

  // 获取 WebDAV 文件数据
  const [lastSaveTime, setLastSaveTime] = useState<number>(0);
  const shouldSkipReload = Date.now() - lastSaveTime < 2000; // 保存后2秒内不重载

  const { data: webdavFile } = trpc.admin.files.readFile.useQuery(
    contentSource && isWebDAVFile
      ? { source: "webdav", path: contentSource.filePath }
      : { source: "webdav", path: "" },
    {
      enabled: !!contentSource && isWebDAVFile && !shouldSkipReload && !isClosingLastTab,
      refetchOnWindowFocus: false, // 避免窗口聚焦时重新获取
    }
  );

  // 获取本地文件数据
  const { data: localFile, error: localFileError } = trpc.admin.files.readFile.useQuery(
    contentSource && isLocalFile ? { source: "local", path: contentSource.filePath } : skipToken,
    {
      retry: false, // 不重试，避免对不存在的文件进行多次请求
      refetchOnWindowFocus: false, // 避免窗口聚焦时重新获取
    }
  );

  // 创建文章
  const _createPostMutation = trpc.admin.posts.create.useMutation({
    onSuccess: (result) => {
      // 创建成功后打开新标签页
      openPostInTab(result.post.id, result.post.title, result.post.body, true);
      setTimeout(() => {
        // 创建新的内容源信息
        const newContentSource: ContentSource = {
          source: "database",
          filePath: result.post.id,
          id: result.post.id,
        };
        onContentSourceChange?.(newContentSource);
        // 兼容旧的回调
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
      const currentId = contentSource?.filePath || contentSource?.id;
      if (currentId) {
        markTabSaved(currentId);
      }
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
      // 如果正在关闭最后一个标签页，跳过标签页创建
      if (isClosingLastTab) {
        console.log(`[PostUniversalEditor] 正在关闭最后一个标签页，跳过标签页创建: ${postId}`);
        return;
      }

      // 如果正在重命名，跳过标签页创建以避免重复
      if (isRenaming) {
        console.log(`[PostUniversalEditor] 正在重命名，跳过标签页创建: ${postId}`);
        return;
      }

      // 创建内容源信息
      const contentSource = selectedContentSource || {
        source: "database",
        filePath: postId,
        id: postId,
      };

      // 生成二元格式的标签页ID
      const tabId = `${contentSource.source}:${contentSource.filePath}`;

      // 检查是否已经打开（精确ID匹配）
      const existingTab = tabs.find((tab) => tab.id === tabId);
      if (existingTab) {
        setActiveTab(tabId);
        return;
      }

      // 检查是否已存在相同路径的标签页（防止重命名时的重复）
      const existingTabByPath = tabs.find((tab) => {
        // 从ID中提取路径部分进行比较
        const tabPath = tab.id.split(":").slice(1).join(":");
        const currentPath = contentSource.filePath;
        return tabPath === currentPath;
      });
      if (existingTabByPath) {
        console.log(
          `[PostUniversalEditor] 发现相同路径的标签页，设置为活动: ${existingTabByPath.id} (请求的: ${tabId})`
        );
        setActiveTab(existingTabByPath.id);
        return;
      }

      const newTab: EditorTab = {
        id: tabId, // 使用二元格式ID
        title: title || "未命名文章",
        content,
        isDirty: isNew,
        mode: "wysiwyg",
        contentSource,
        identifier: {
          source: contentSource.source as "local" | "webdav" | "database",
          path: contentSource.filePath,
        },
      };

      // 使用 Jotai 的 addTab 替代本地状态管理
      addTab(newTab);

      // 自动展开相关文件夹
      autoExpandFolders(contentSource.filePath);
    },
    [
      isClosingLastTab,
      isRenaming,
      selectedContentSource,
      tabs,
      setActiveTab,
      addTab, // 自动展开相关文件夹
      autoExpandFolders,
    ]
  );

  // 防止重复打开相同文章
  // const handleFileSelect = useCallback(
  //   (fileId: string, fileName?: string) => {
  //     console.log("🔄 [PostUniversalEditor] 选择文件:", { fileId, fileName });

  //     // 检查是否已经在标签页中
  //     const existingTab = tabs.find((tab) => tab.id === fileId);
  //     if (existingTab) {
  //       setActiveTab(fileId);
  //       setTimeout(() => {
  //         onPostChange?.(fileId);
  //       }, 0);
  //       return;
  //     }

  //     // 如果是 WebDAV 文件路径（以 / 开头），需要特殊处理
  //     if (fileId.startsWith("/")) {
  //       console.log("📁 [PostUniversalEditor] 检测到 WebDAV 文件路径:", fileId);
  //       // TODO: 实现 WebDAV 文件加载逻辑
  //       // 暂时使用文件路径作为 ID
  //       setTimeout(() => {
  //         onPostChange?.(fileId);
  //       }, 0);
  //       return;
  //     }

  //     // 如果不存在，则正常处理数据库文章
  //     setTimeout(() => {
  //       onPostChange?.(fileId);
  //     }, 0);
  //   },
  //   [tabs, onPostChange, setActiveTab]
  // );

  // 处理文章数据加载
  useEffect(() => {
    // 如果正在关闭最后一个标签页，跳过文件加载
    if (isClosingLastTab) {
      console.log("📁 [PostUniversalEditor] 正在关闭最后一个标签页，跳过数据库文章加载");
      return;
    }

    if (post && contentSource && isDatabasePost) {
      const tabId = `${contentSource.source}:${contentSource.filePath}`;
      setPostData((prev) => ({
        ...prev,
        [tabId]: {
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
  }, [post, contentSource, isDatabasePost, openPostInTab, isClosingLastTab]);

  // 处理通过 slug 查询到的文章（可能需要读取文件内容）
  useEffect(() => {
    if (post && contentSource && isWebDAVFile) {
      // 对于 WebDAV 文章，我们需要等待 webdavFile 数据加载
      // 这个逻辑会在 WebDAV 文件数据加载的 useEffect 中处理
    }
  }, [post, contentSource, isWebDAVFile]);

  // 处理 WebDAV 文件数据加载
  useEffect(() => {
    if (webdavFile && contentSource && isWebDAVFile) {
      console.log("📁 [PostUniversalEditor] 加载 WebDAV 文件:", {
        filePath: contentSource.filePath,
        contentLength: webdavFile.content.length,
        hasPost: !!post,
      });

      try {
        // 解析 Markdown 内容，提取 frontmatter 和正文
        const parsed = parseMarkdownContent(webdavFile.content, contentSource.filePath);
        const { frontmatter, body } = parsed;

        console.log("🔧 [PostUniversalEditor] 解析 frontmatter:", {
          frontmatter,
          bodyLength: body.length,
        });

        // 优先使用 frontmatter 中的数据，其次使用数据库中的数据，最后使用文件名
        const title =
          (frontmatter.title as string) ||
          post?.title ||
          contentSource.filePath.split("/").pop()?.replace(/\.md$/, "") ||
          "未命名文件";

        const slug =
          (frontmatter.slug as string) ||
          post?.slug ||
          contentSource.filePath.split("/").pop()?.replace(/\.md$/, "") ||
          "untitled";

        console.log("🔧 [PostUniversalEditor] WebDAV 文件数据提取:", {
          frontmatterTitle: frontmatter.title,
          frontmatterSlug: frontmatter.slug,
          postTitle: post?.title,
          postSlug: post?.slug,
          finalTitle: title,
          finalSlug: slug,
        });

        const tabId = `${contentSource.source}:${contentSource.filePath}`;
        setPostData((prev) => ({
          ...prev,
          [tabId]: {
            id: tabId,
            title: title,
            slug: slug,
            body: webdavFile.content, // 保持完整内容（包括 frontmatter）
            excerpt: (frontmatter.excerpt as string) || "",
            type: (frontmatter.type as string) || post?.type || "post",
            draft: (frontmatter.draft as boolean) ?? post?.draft ?? false,
            public: (frontmatter.public as boolean) ?? post?.public ?? true,
          },
        }));

        openPostInTab(contentSource.filePath, title, webdavFile.content);
      } catch (error) {
        console.error("❌ [PostUniversalEditor] 解析 WebDAV 文件失败:", error);

        // 解析失败时的后备逻辑
        const title =
          post?.title ||
          contentSource.filePath.split("/").pop()?.replace(/\.md$/, "") ||
          "未命名文件";
        const slug =
          post?.slug || contentSource.filePath.split("/").pop()?.replace(/\.md$/, "") || "untitled";

        const tabId = `${contentSource.source}:${contentSource.filePath}`;
        setPostData((prev) => ({
          ...prev,
          [tabId]: {
            id: tabId,
            title: title,
            slug: slug,
            body: webdavFile.content,
            excerpt: "",
            type: post?.type || "post",
            draft: post?.draft ?? false,
            public: post?.public ?? true,
          },
        }));

        openPostInTab(contentSource.filePath, title, webdavFile.content);
      }
    }
  }, [webdavFile, contentSource, isWebDAVFile, post, openPostInTab]);

  // 处理本地文件数据加载
  useEffect(() => {
    // 检查文件是否成功加载，如果有错误则跳过
    if (localFileError) {
      console.log("📁 [PostUniversalEditor] 本地文件加载失败，跳过创建标签页:", {
        source: contentSource?.source,
        path: contentSource?.filePath,
        error: localFileError.message,
      });
      return;
    }

    if (localFile && contentSource && isLocalFile) {
      console.log("📁 [PostUniversalEditor] 加载本地文件:", {
        source: contentSource.source,
        path: contentSource.filePath,
        contentLength: localFile.content.length,
      });

      // 解析文件名作为标题
      const fileName = contentSource.filePath.split("/").pop() || "未命名文件";
      const title = fileName.replace(/\.md$/, "");

      // 使用二元ID格式：source:path
      const tabId = `local:${contentSource.filePath}`;
      setPostData((prev) => ({
        ...prev,
        [tabId]: {
          id: tabId,
          title: title,
          slug: contentSource.filePath.replace(/[^a-zA-Z0-9]/g, "-"),
          body: localFile.content,
          excerpt: "",
          type: inferContentTypeFromPath(contentSource.filePath),
          draft: false,
          public: true,
        },
      }));

      openPostInTab(contentSource.filePath, title, localFile.content);
    }
  }, [localFile, localFileError, contentSource, isLocalFile, openPostInTab]);

  // 处理新文件创建
  useEffect(() => {
    if (contentSource && isNewFile) {
      console.log("📝 [PostUniversalEditor] 创建新文件:", contentSource);

      // 移除 __NEW__ 前缀获取实际文件路径
      const actualFilePath = contentSource.filePath.replace("__NEW__", "");

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
      openPostInTab(contentSource.filePath, title, defaultContent, true);
    }
  }, [contentSource, isNewFile, openPostInTab]);

  // 处理标签页切换
  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);

      // 自动展开相关文件夹
      autoExpandFolders(tabId);

      // 同时更新EditorState以触发展开和滚动
      // 注意：这里的tabId已经是完整的二元ID格式（如 local:blog/hello-world.md）
      // editorState.setActiveTab(tabId); // 移除旧的依赖，Jotai 状态管理会自动处理

      // 使用 setTimeout 避免在渲染过程中更新父组件状态
      setTimeout(() => {
        // 根据 tabId 创建对应的 ContentSource
        const newContentSource = convertTabIdToContentSource(tabId);
        onContentSourceChange?.(newContentSource);
        // 兼容旧的回调
        onPostChange?.(tabId);
      }, 0);
    },
    [onContentSourceChange, onPostChange, setActiveTab, autoExpandFolders]
  );

  // 处理标签页关闭
  const handleTabClose = useCallback(
    (tabId: string) => {
      // 使用 Jotai 的 removeTab，它会自动处理活动标签页的切换
      removeTab(tabId);

      // 兼容旧的回调 - 获取切换后的活动标签页
      const remainingTabs = tabs.filter((tab) => tab.id !== tabId);
      if (tabId === activeTabId) {
        const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
        const nextTab =
          remainingTabs[currentIndex] || remainingTabs[currentIndex - 1] || remainingTabs[0];
        if (nextTab?.id) {
          const newContentSource = convertTabIdToContentSource(nextTab.id);
          onContentSourceChange?.(newContentSource);
          onPostChange?.(nextTab.id);
        } else {
          // 关闭最后一个标签页时，立即清除 selectedContentSource
          onContentSourceChange?.(undefined);
          onPostChange?.("");
        }
      }

      // 清理文章数据
      setPostData((prev) => {
        const newData = { ...prev };
        delete newData[tabId];
        return newData;
      });
    },
    [removeTab, tabs, activeTabId, onContentSourceChange, onPostChange]
  );

  // 处理内容变化
  const handleContentChange = (tabId: string, content: string) => {
    // 使用 Jotai 的 updateTabContent
    updateTabContent(tabId, content);

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
    // 使用 Jotai 的 updateTabMode
    updateTabMode(tabId, mode);
  };

  // 处理预览按钮点击 - 在新窗口打开前台详情页
  const handlePreview = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      const data = postData[tabId];

      if (!tab || !data) return;

      try {
        // 从二元ID中提取文件路径
        const filePath = tabId.includes(":") ? tabId.split(":").slice(1).join(":") : tabId;

        // 判断内容类型
        const contentType = inferContentTypeFromPath(filePath);

        let frontendUrl = "";

        if (contentType === "memo") {
          // 对于 memo，使用文件路径生成 URL
          frontendUrl = generateContentUrl("memo", filePath);
        } else {
          // 对于文章，使用文章数据构建 frontmatter 格式
          const frontmatter = {
            slug: data.slug,
            title: data.title,
            type: data.type,
          };
          frontendUrl = generateContentUrl("post", frontmatter, filePath);
        }

        // 在新窗口打开
        window.open(frontendUrl, "_blank", "noopener,noreferrer");

        console.log("🔍 [PostUniversalEditor] 预览内容:", {
          tabId,
          contentType,
          frontendUrl,
          fileName: tabId.split(/[/\\]/).pop(),
        });
      } catch (error) {
        console.error("🔍 [PostUniversalEditor] 预览失败:", error);
        alert("预览失败，请稍后重试");
      }
    },
    [tabs, postData]
  );

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

      // 自动生成 slug（需要在图片处理前生成，因为图片文件名需要使用 slug）
      const slug =
        data.slug ||
        (data.title || tab.title || "untitled")
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
          .replace(/^-+|-+$/g, "");

      console.log("🔧 [PostUniversalEditor] Slug 调试信息:", {
        tabId,
        dataSlug: data.slug,
        dataTitle: data.title,
        tabTitle: tab.title,
        finalSlug: slug,
      });

      // 处理内联 Base64 图片（传递 slug 用于生成文件名）
      const processedContent = await processInlineImages(tab.content, tabId, slug);

      console.log("📝 [PostUniversalEditor] 图片处理完成:", {
        originalLength: tab.content.length,
        processedLength: processedContent.length,
        hasImages: processedContent.includes("!["),
        slug: slug,
      });

      // 从二元ID中提取文件路径
      const filePath = tabId.includes(":") ? tabId.split(":").slice(1).join(":") : tabId;

      // 根据文件类型选择保存方法
      const isNewFile = filePath.startsWith("__NEW__");
      const actualPath = isNewFile ? filePath.replace("__NEW__", "") : filePath;
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
        // 构建新的二元格式ID
        const [source] = tabId.split(":");
        const newTabId = `${source}:${actualPath}`;

        updateTabId(tabId, newTabId, processedContent);
        // 更新 postData 的键
        setPostData((prev) => {
          const newData = { ...prev };
          newData[newTabId] = { ...newData[tabId], body: processedContent };
          delete newData[tabId];
          return newData;
        });
        // 更新选中的文章 ID
        onPostChange?.(newTabId);
      } else {
        // 更新标签页状态为已保存，并更新内容为处理后的内容
        markTabSaved(tabId, processedContent);
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
  // const convertApiUrlsToRelativePaths = (content: string): string => {
  //   // 匹配 API URL 格式的图片路径
  //   const apiUrlRegex = /!\[([^\]]*)\]\(\/api\/files\/[^/]+\/(.+?)\)/g;

  //   return content.replace(apiUrlRegex, (_match, alt, relativePath) => {
  //     // 确保相对路径以 ./ 开头
  //     const normalizedPath = relativePath.startsWith("./") ? relativePath : `./${relativePath}`;
  //     console.log("🔄 [PostUniversalEditor] 转换API URL回相对路径:", {
  //       original: _match,
  //       converted: `![${alt}](${normalizedPath})`,
  //     });
  //     return `![${alt}](${normalizedPath})`;
  //   });
  // };

  /**
   * 根据文章路径生成对应的 assets 目录路径
   */
  const getArticleAssetsPath = (tabId: string): string => {
    // 1. 从二元ID中提取文件路径
    const filePath = tabId.includes(":") ? tabId.split(":").slice(1).join(":") : tabId;

    // 2. 移除 __NEW__ 前缀（如果存在）
    const cleanPath = filePath.startsWith("__NEW__") ? filePath.replace("__NEW__", "") : filePath;

    // 3. 提取目录路径（去掉文件名）
    const pathParts = cleanPath.split("/");
    pathParts.pop(); // 移除文件名部分
    const directoryPath = pathParts.join("/").replace(/^\/+/, "");

    // 3. 构建 assets 路径
    if (directoryPath) {
      return `${directoryPath}/assets`;
    } else {
      // 如果文件在根目录，则 assets 也在根目录
      return "assets";
    }
  };

  // 处理内联图片上传 - 使用统一的图片处理工具函数
  const processInlineImages = async (
    content: string,
    tabId: string,
    articleSlug?: string
  ): Promise<string> => {
    console.log("🔍 [PostUniversalEditor] 开始处理内联图片:", {
      tabId,
      articleSlug,
      contentLength: content.length,
      hasDataImage: content.includes("data:image"),
    });

    try {
      // 从二元ID中提取文件路径
      const filePath = tabId.includes(":") ? tabId.split(":").slice(1).join(":") : tabId;

      // 确定内容源类型
      const contentSource = filePath.startsWith("/") ? "webdav" : "local";

      // 使用统一的图片处理函数，传递自定义 slug
      const result = await processInlineImagesCompat(
        content,
        contentSource,
        filePath,
        "relative", // PostUniversalEditor 使用相对路径格式
        articleSlug // 传递文章 slug 用于生成文件名
      );

      console.log("✅ [PostUniversalEditor] 图片处理完成:", {
        tabId,
        contentSource,
        originalLength: content.length,
        processedLength: result.length,
        hasChanges: result !== content,
      });

      return result;
    } catch (error) {
      console.error("❌ [PostUniversalEditor] 图片处理失败:", error);
      // 保持与原有行为一致，抛出错误
      throw new Error(`图片上传失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 创建新文章
  // const handleCreatePost = async () => {
  //   try {
  //     await _createPostMutation.mutateAsync({
  //       title: "新文章",
  //       slug: `new-post-${Date.now()}`,
  //       body: "# 新文章\n\n开始写作...",
  //       excerpt: "",
  //       type: "post",
  //       draft: true,
  //       public: true,
  //     });
  //   } catch (error) {
  //     console.error("创建文章失败:", error);
  //   }
  // };

  // 注意：如果需要暴露方法给父组件，应该使用 useImperativeHandle 和 forwardRef

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  if (!activeTab) {
    return (
      <div className="h-full flex flex-col">
        {/* 标签页栏 */}
        <div className="flex-shrink-0 border-b border-base-300">
          <div className="flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`group flex items-stretch border-r border-base-300 flex-shrink-0 min-w-0 max-w-xs ${
                  tab.id === activeTabId ? "bg-base-200" : "hover:bg-base-100"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center px-4 py-2 text-left"
                  onClick={() => handleTabChange(tab.id)}
                >
                  <span className="mr-2 flex-shrink-0">{tab.isDirty ? "●" : ""}</span>
                  <span className="text-sm truncate flex-1 min-w-0" title={tab.title}>
                    {tab.title}
                  </span>
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-xs hover:text-error flex-shrink-0"
                  onClick={() => handleTabClose(tab.id)}
                  aria-label={`关闭 ${tab.title}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 空状态 */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 flex justify-center">
              <Icon name="lucide:edit" size={64} />
            </div>
            <p className="text-lg mb-2">选择一个文件开始编辑</p>
            <p className="text-sm text-gray-500">或者创建一个新文件</p>
          </div>
        </div>
      </div>
    );
  }

  // 基于活动标签页推导编辑器需要的内容源与 Markdown 文件路径信息
  // 注意：tab.id 使用的是二元ID格式（如 "webdav:/blog/06-svg-image-test.md"），
  // 不能直接用于判断内容源或文件路径，否则会导致 WebDAV 文章被错误地当成本地文件处理。
  const { articlePathForEditor, editorContentSource } = (() => {
    const identifier = activeTab.identifier;
    const rawPath = identifier?.path || "";

    // 文件型内容（local/webdav）：使用真实的 markdown 文件路径
    if (identifier && (identifier.source === "local" || identifier.source === "webdav")) {
      const withoutNew = rawPath.startsWith("__NEW__") ? rawPath.replace("__NEW__", "") : rawPath;

      // 传给图片工具的 markdownFilePath 始终使用去掉前导斜杠的相对路径，
      // 例如："blog/06-svg-image-test.md"
      const markdownFilePath = withoutNew.replace(/^\/+/, "");

      // 传给编辑器/Markdown 插件的 articlePath 保持以 / 开头的形式，
      // 例如："/blog/06-svg-image-test.md" —— 兼容现有基于目录的解析逻辑。
      const articlePath = `/${markdownFilePath}`;

      return {
        articlePathForEditor: articlePath,
        editorContentSource: identifier.source as "local" | "webdav",
      };
    }

    // 数据库文章没有真实文件路径，保持历史行为：
    // - 使用 tab.id 作为 articlePath
    // - 将内容源视为 local（图片继续走 /api/files/local/...）
    const fallbackArticlePath = activeTab.id.startsWith("__NEW__")
      ? activeTab.id.replace("__NEW__", "")
      : activeTab.id;

    return {
      articlePathForEditor: fallbackArticlePath,
      editorContentSource: "local" as const,
    };
  })();

  return (
    <div className="h-full flex flex-col">
      {/* 标签页栏 */}
      <div className="flex-shrink-0 border-b border-base-300">
        <div className="flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex items-stretch border-r border-base-300 flex-shrink-0 min-w-0 max-w-xs transition-all duration-200 ${
                tab.id === activeTabId
                  ? "editor-tab-active bg-base-100 text-primary shadow-sm"
                  : "hover:bg-base-100 hover:shadow-sm"
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center px-4 py-2 text-left"
                onClick={() => handleTabChange(tab.id)}
              >
                <span className="mr-2 flex-shrink-0">{tab.isDirty ? "●" : ""}</span>
                <span className="text-sm truncate flex-1 min-w-0" title={tab.title}>
                  {tab.title}
                </span>
              </button>
              <button
                type="button"
                className="px-3 py-2 text-xs hover:text-error flex-shrink-0"
                onClick={() => handleTabClose(tab.id)}
                aria-label={`关闭 ${tab.title}`}
              >
                ✕
              </button>
            </div>
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
            <Icon name="lucide:edit" size={16} />
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
            <Icon name="lucide:eye" size={16} />
          </button>
          <div className="flex-1"></div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => handlePreview(activeTab.id)}
            title="在新窗口预览"
          >
            <Icon name="lucide:external-link" size={16} />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => handleSave(activeTab.id)}
          >
            <Icon name="lucide:save" size={16} />
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
          attachmentBasePath={getArticleAssetsPath(activeTab.id)}
          articlePath={articlePathForEditor}
          // 使用基于 identifier 的内容源信息，避免将 WebDAV 文章误判为 local
          contentSource={editorContentSource}
          mode={activeTab.mode as EditorMode}
          onModeChange={(mode) => handleModeChange(activeTab.id, mode)}
          className="h-full"
        />
      </div>
    </div>
  );
}

/**
 * 将旧的 id 参数转换为内容源信息（兼容函数）
 */
function convertLegacyIdToContentSource(id: string): ContentSource {
  if (id.startsWith("/")) {
    // WebDAV 文件
    return {
      source: "webdav",
      filePath: id,
      id,
    };
  } else if (id.includes("/") || id.endsWith(".md")) {
    // 本地文件
    return {
      source: "local",
      filePath: id,
      id,
    };
  } else {
    // 数据库文章
    return {
      source: "database",
      filePath: id,
      id,
    };
  }
}

/**
 * 将标签页 ID 转换为内容源信息
 */
function convertTabIdToContentSource(tabId: string): ContentSource {
  // 解析二元格式的标签页ID：source:path
  const [source, ...pathParts] = tabId.split(":");
  if (source && pathParts.length > 0) {
    const path = pathParts.join(":"); // 重新拼接，防止path中包含冒号
    return {
      source: source as "database" | "webdav" | "local",
      filePath: path,
      id: tabId,
    };
  }

  // 后备逻辑：如果不是二元格式，使用旧的转换逻辑
  return convertLegacyIdToContentSource(tabId);
}
