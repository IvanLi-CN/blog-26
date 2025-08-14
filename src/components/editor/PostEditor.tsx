"use client";

/**
 * 文章编辑器主组件
 *
 * 实现左右分栏布局：左侧文件树，右侧编辑器
 */

import React, { useCallback, useState } from "react";
import { DirectoryTree } from "./DirectoryTree";
import { PostUniversalEditor } from "./PostUniversalEditor";

interface PostEditorProps {
  initialPostId?: string;
}

export function PostEditor({ initialPostId }: PostEditorProps) {
  const [selectedPostId, setSelectedPostId] = useState<string>(initialPostId || "");
  const [sidebarWidth, setSidebarWidth] = useState(300); // 侧边栏宽度
  const [isResizing, setIsResizing] = useState(false);

  // 处理文件选择
  const handleFileSelect = (postId: string) => {
    setSelectedPostId(postId);
  };

  // 处理创建新文件
  const handleCreateFile = (fullPath: string, fileName: string) => {
    // 使用特殊前缀标识新文件
    const newFileId = `__NEW__${fullPath}`;

    console.log("创建新文章:", { fullPath, fileName, newFileId });

    // 选择新创建的文件
    setSelectedPostId(newFileId);
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
          selectedPath={selectedPostId}
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
        <PostUniversalEditor selectedPostId={selectedPostId} onPostChange={setSelectedPostId} />
      </div>
    </div>
  );
}
