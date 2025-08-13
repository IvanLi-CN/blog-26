"use client";

/**
 * 文件目录树组件
 *
 * 模仿原项目的文件管理器界面
 */

import { useState } from "react";
import { trpc } from "../../lib/trpc";

// 文件夹图标组件
const FolderIcon = ({ isOpen }: { isOpen: boolean }) => (
  <span className="mr-2 text-blue-500">{isOpen ? "📂" : "📁"}</span>
);

// 文件图标组件
const FileIcon = ({ post }: { post: FileNode }) => (
  <span className="mr-2">{post.draft ? "📄" : "📝"}</span>
);

interface DirectoryTreeProps {
  onSelectFile: (filePath: string) => void;
  onCreateFile: () => void;
  selectedPath?: string;
}

interface FileNode {
  id: string;
  title: string;
  slug: string;
  type: string;
  draft: boolean;
  public: boolean;
  publishDate: string;
  updateDate?: string;
}

export function DirectoryTree({ onSelectFile, onCreateFile, selectedPath }: DirectoryTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["posts"]));

  // 获取所有文章
  const { data: posts, isLoading } = trpc.admin.posts.list.useQuery({
    page: 1,
    limit: 100,
    status: "all",
  });

  // 处理文件选择
  const handleFileSelect = (post: FileNode) => {
    onSelectFile(post.id);
  };

  // 切换文件夹展开状态
  const toggleFolder = (folderName: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderName)) {
        newSet.delete(folderName);
      } else {
        newSet.add(folderName);
      }
      return newSet;
    });
  };

  // 按类型分组文章
  const groupedPosts =
    posts?.posts?.reduce(
      (acc, post) => {
        const type = post.type || "post";
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(post);
        return acc;
      },
      {} as Record<string, FileNode[]>
    ) || {};

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center">
          <span className="loading loading-spinner loading-sm"></span>
          <span className="ml-2 text-sm">加载文件...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-base-100 border-r border-base-300">
      {/* 头部工具栏 */}
      <div className="p-3 border-b border-base-300 bg-base-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-base-content">文件管理器</h3>
          <button
            type="button"
            onClick={onCreateFile}
            className="btn btn-xs btn-primary"
            title="新建文章"
          >
            ➕
          </button>
        </div>
      </div>

      {/* 文件树 */}
      <div className="p-2 overflow-y-auto h-full">
        {Object.entries(groupedPosts).map(([type, files]) => {
          const folderName =
            type === "post"
              ? "文章"
              : type === "project"
                ? "项目"
                : type === "memo"
                  ? "闪念"
                  : type;
          const isExpanded = expandedFolders.has(type);

          return (
            <div key={type} className="mb-2">
              {/* 文件夹 */}
              <button
                type="button"
                className="flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm w-full text-left"
                onClick={() => toggleFolder(type)}
              >
                <FolderIcon isOpen={isExpanded} />
                <span className="font-medium">{folderName}</span>
                <span className="ml-auto text-xs text-base-content/60">{files.length}</span>
              </button>

              {/* 文件列表 */}
              {isExpanded && (
                <div className="ml-4 mt-1">
                  {files.map((post) => (
                    <button
                      type="button"
                      key={post.id}
                      className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors w-full text-left ${
                        selectedPath === post.id ? "bg-primary/10 text-primary" : ""
                      }`}
                      onClick={() => handleFileSelect(post)}
                      title={post.title}
                    >
                      <FileIcon post={post} />
                      <span className="truncate flex-1">{post.title}</span>
                      {post.draft && (
                        <span className="ml-1 text-xs text-warning" title="草稿">
                          ●
                        </span>
                      )}
                    </button>
                  ))}

                  {files.length === 0 && (
                    <div className="px-2 py-1 text-xs text-base-content/50">暂无文件</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(groupedPosts).length === 0 && (
          <div className="text-center py-8 text-base-content/50">
            <div className="text-2xl mb-2">📁</div>
            <p className="text-sm">暂无文章</p>
            <button type="button" onClick={onCreateFile} className="btn btn-sm btn-primary mt-2">
              创建第一篇文章
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
