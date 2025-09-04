"use client";

/**
 * 文章编辑器主组件
 *
 * 实现左右分栏布局：左侧文件树，右侧编辑器
 */

import React, { useCallback, useEffect, useState } from "react";
import { DirectoryTree } from "./DirectoryTree";
import type { ContentSource } from "./PostEditorWrapper";
import { PostUniversalEditor } from "./PostUniversalEditor";

interface PostEditorProps {
  initialContentSource?: ContentSource;
  // 保留旧接口以防其他地方还在使用
  initialPostId?: string;
}

export function PostEditor({ initialContentSource, initialPostId }: PostEditorProps) {
  // const editorState = useAdvancedEditorState(); // 移除旧的依赖

  // 兼容旧的 initialPostId 参数
  const [selectedContentSource, setSelectedContentSource] = useState<ContentSource | undefined>(
    initialContentSource ||
      (initialPostId ? convertLegacyIdToContentSource(initialPostId) : undefined)
  );
  const [sidebarWidth, setSidebarWidth] = useState(300); // 侧边栏宽度
  const [isResizing, setIsResizing] = useState(false);

  // 监听 initialContentSource 的变化
  useEffect(() => {
    if (initialContentSource) {
      setSelectedContentSource(initialContentSource);
    }
  }, [initialContentSource]);

  // 处理文件选择
  const handleFileSelect = (postId: string) => {
    // 将旧的 postId 转换为 ContentSource
    const contentSource = convertLegacyIdToContentSource(postId);
    setSelectedContentSource(contentSource);

    // 使用新的状态管理打开文件
    // editorState.openFile(contentSource); // 暂时移除，使用 Jotai 状态管理
  };

  // 处理创建新文件
  const handleCreateFile = (fullPath: string, fileName: string) => {
    // 创建新文件的内容源信息
    const contentSource: ContentSource = {
      source: fullPath.startsWith("/") ? "webdav" : "local",
      filePath: `__NEW__${fullPath}`, // 保持新文件的特殊标识
      id: `__NEW__${fullPath}`,
    };

    console.log("创建新文章:", { fullPath, fileName, contentSource });

    setSelectedContentSource(contentSource);

    // 使用新的状态管理打开新文件
    // const defaultContent = `# ${fileName}\n\n开始写作您的文章...`;
    // editorState.openFile(contentSource, fileName, defaultContent); // 暂时移除，使用 Jotai 状态管理
  };

  // 处理拖拽调整侧边栏宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 500) {
        setSidebarWidth(newWidth);
      }
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 添加全局鼠标事件监听
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="h-full w-full flex bg-base-200">
      {/* 左侧文件树 */}
      <div
        className="bg-base-100 border-r border-base-300 flex-shrink-0"
        style={{ width: sidebarWidth }}
      >
        <DirectoryTree
          onSelectFile={handleFileSelect}
          onCreateFile={handleCreateFile}
          selectedPath={selectedContentSource?.id || selectedContentSource?.filePath}
        />
      </div>

      {/* 拖拽分割线 */}
      <div
        className={`w-1 bg-base-300 cursor-col-resize hover:bg-primary/50 transition-colors ${
          isResizing ? "bg-primary" : ""
        }`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整面板大小"
        aria-valuenow={sidebarWidth}
        tabIndex={0}
      />

      {/* 右侧编辑器 */}
      <div className="flex-1 min-w-0">
        <PostUniversalEditor
          selectedContentSource={selectedContentSource}
          onContentSourceChange={setSelectedContentSource}
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
