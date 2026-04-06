"use client";

/**
 * 文件目录树组件
 *
 * 模仿原项目的文件管理器界面
 * 集成智能展开和滚动定位功能
 */

import { useAtom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { trpc } from "../../lib/trpc";
import {
  expandedFoldersAtom,
  scrollTargetAtom,
  selectedFilePathAtom,
  setSelectedFilePathAtom,
  toggleFolderAtom,
  updateTabsAfterRenameAtom,
} from "../../store/editorAtoms";
import Icon from "../ui/Icon";
import type { ContentSource } from "./PostEditorWrapper";
import { RenameDialog } from "./RenameDialog";
// import { useAdvancedEditorState } from "./hooks/useEditorState"; // 移除旧的依赖
import { generateScrollDataAttribute } from "./utils/pathUtils";

// 文件项排序工具函数
function sortFileItems<T extends { type: string; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // 目录优先于文件
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;

    // 同类型按名称字母顺序排序
    return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
  });
}

// 子目录内容组件
// interface SubDirectoryContentProps {
//   source: string;
//   path: string;
//   onSelectFile?: (path: string, name: string) => void;
//   selectedFilePath?: string;
//   expandedFolders: Set<string>;
//   toggleFolder: (folderName: string) => void;
// }

// function SubDirectoryContent({
//   source,
//   path,
//   onSelectFile,
//   selectedFilePath,
//   expandedFolders,
//   toggleFolder,
// }: SubDirectoryContentProps) {
//   // 获取子目录内容
//   const { data: subDirFiles, isLoading } = trpc.admin.files.listDirectory.useQuery(
//     { source, path },
//     { enabled: true }
//   );

//   if (isLoading) {
//     return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">加载中...</div>;
//   }

//   if (!subDirFiles?.items?.length) {
//     return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">空目录</div>;
//   }

//   return (
//     <div className="ml-4 border-l border-base-300">
//       {subDirFiles.items.map((file) => (
//         <button
//           key={file.path}
//           type="button"
//           className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors w-full text-left ${
//             selectedFilePath === file.path ? "bg-primary/10 text-primary" : ""
//           }`}
//           onClick={() => {
//             if (file.type === "directory") {
//               // 子目录：展开/折叠
//               _toggleFolder(`${source}-${path}/${file.path}`);
//             } else {
//               // 文件：打开编辑
//               const fullPath =
//                 source === "webdav" ? `/${path}/${file.path}` : `${path}/${file.path}`;
//               onSelectFile?.(fullPath, file.name);
//             }
//           }}
//           title={file.name}
//         >
//           <span className="mr-2">
//             {file.type === "directory" ? (
//               <Icon name="lucide:folder" size={16} />
//             ) : (
//               <Icon name="lucide:edit" size={16} />
//             )}
//           </span>
//           <span className="truncate flex-1">{file.name}</span>
//           {file.size && (
//             <span className="ml-2 text-xs text-base-content/40">
//               {Math.round(file.size / 1024)}KB
//             </span>
//           )}
//         </button>
//       ))}
//     </div>
//   );
// }

// WebDAV 子目录组件
function WebDAVSubDirectory({
  file,
  source,
  onSelectFile,
  selectedFilePath,
  expandedFolders,
  toggleFolder,
  onCreateFile,
  onRename,
}: {
  file: { type: string; path: string; name?: string };
  source: string;
  onSelectFile?: (path: string, name: string) => void;
  selectedFilePath?: string;
  expandedFolders: Set<string>;
  toggleFolder: (folderName: string) => void;
  onCreateFile?: (directoryPath: string, source: string) => void;
  onRename?: (path: string, source: string, type: "file" | "directory") => void;
}) {
  // 获取子目录内容
  const { data: subDirFiles, isLoading } = trpc.admin.files.listDirectory.useQuery(
    { source, path: file.path },
    { enabled: file.type === "directory" && expandedFolders.has(`webdav-${file.path}`) }
  );

  // 只有目录且已展开时才显示子内容
  if (file.type !== "directory" || !expandedFolders.has(`webdav-${file.path}`)) {
    return null;
  }

  if (isLoading) {
    return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">加载中...</div>;
  }

  if (!subDirFiles?.items?.length) {
    return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">空目录</div>;
  }

  return (
    <div className="ml-4 border-l border-base-300">
      {sortFileItems(subDirFiles.items).map((subFile) => (
        <div key={subFile.path}>
          <div className="group flex items-center w-full">
            <button
              type="button"
              className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                selectedFilePath === `/${subFile.path}` ? "bg-primary/10 text-primary" : ""
              }`}
              onClick={() => {
                if (subFile.type === "directory") {
                  // 子目录：展开/折叠
                  toggleFolder(`webdav-${subFile.path}`);
                } else {
                  // 文件：打开编辑
                  // 确保路径以单个斜杠开头
                  const normalizedPath = subFile.path.startsWith("/")
                    ? subFile.path
                    : `/${subFile.path}`;
                  onSelectFile?.(normalizedPath, subFile.name);
                }
              }}
              title={subFile.name}
            >
              <span className="mr-2 flex-shrink-0">
                {subFile.type === "directory" ? (
                  <Icon name="lucide:folder" size={16} />
                ) : (
                  <Icon name="lucide:edit" size={16} />
                )}
              </span>
              <span className="truncate flex-1">{subFile.name}</span>
              {subFile.type === "file" && subFile.size ? (
                <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                  {Math.round(subFile.size / 1024)}KB
                </span>
              ) : null}
            </button>
            {subFile.type === "directory" && onCreateFile && (
              <DirectoryActions
                directoryPath={subFile.path}
                source={source}
                onCreateFile={onCreateFile}
                onRename={onRename}
              />
            )}
            {subFile.type === "file" && onRename && (
              <FileActions filePath={subFile.path} source={source} onRename={onRename} />
            )}
          </div>
          {/* 递归渲染子目录 */}
          <WebDAVSubDirectory
            file={subFile}
            source={source}
            onSelectFile={onSelectFile}
            selectedFilePath={selectedFilePath ?? undefined}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onCreateFile={onCreateFile}
            onRename={onRename}
          />
        </div>
      ))}
    </div>
  );
}

// 本地子目录组件
function LocalSubDirectory({
  file,
  source,
  onSelectFile,
  selectedFilePath,
  expandedFolders,
  toggleFolder,
  onCreateFile,
  onRename,
}: {
  file: { type: string; path: string; name?: string };
  source: string;
  onSelectFile?: (path: string, name: string) => void;
  selectedFilePath?: string;
  expandedFolders: Set<string>;
  toggleFolder: (folderName: string) => void;
  onCreateFile?: (directoryPath: string, source: string) => void;
  onRename?: (path: string, source: string, type: "file" | "directory") => void;
}) {
  // 获取子目录内容
  const { data: subDirFiles, isLoading } = trpc.admin.files.listDirectory.useQuery(
    { source, path: file.path },
    { enabled: file.type === "directory" && expandedFolders.has(`local-${file.path}`) }
  );

  // 只有目录且已展开时才显示子内容
  if (file.type !== "directory" || !expandedFolders.has(`local-${file.path}`)) {
    return null;
  }

  if (isLoading) {
    return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">加载中...</div>;
  }

  if (!subDirFiles?.items?.length) {
    return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">空目录</div>;
  }

  return (
    <div className="ml-4 border-l border-base-300">
      {sortFileItems(subDirFiles.items).map((subFile) => (
        <div key={subFile.path}>
          <div className="group flex items-center w-full">
            <button
              type="button"
              className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                selectedFilePath === subFile.path ? "bg-primary/10 text-primary" : ""
              }`}
              onClick={() => {
                if (subFile.type === "directory") {
                  // 子目录：展开/折叠
                  toggleFolder(`local-${subFile.path}`);
                } else {
                  // 文件：打开编辑 - 直接使用subFile.path，不要重复拼接
                  onSelectFile?.(subFile.path, subFile.name);
                }
              }}
              title={subFile.name}
              data-file-path={subFile.path}
            >
              <span className="mr-2 flex-shrink-0">
                {subFile.type === "directory" ? (
                  <Icon name="lucide:folder" size={16} />
                ) : (
                  <Icon name="lucide:edit" size={16} />
                )}
              </span>
              <span className="truncate flex-1">{subFile.name}</span>
              {subFile.type === "file" && subFile.size ? (
                <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                  {Math.round(subFile.size / 1024)}KB
                </span>
              ) : null}
            </button>
            {subFile.type === "directory" && onCreateFile && (
              <DirectoryActions
                directoryPath={`${file.path}/${subFile.path}`}
                source={source}
                onCreateFile={onCreateFile}
                onRename={onRename}
              />
            )}
            {subFile.type === "file" && onRename && (
              <FileActions filePath={subFile.path} source={source} onRename={onRename} />
            )}
          </div>
          {/* 递归渲染子目录 */}
          <LocalSubDirectory
            file={subFile}
            source={source}
            onSelectFile={onSelectFile}
            selectedFilePath={selectedFilePath ?? undefined}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onCreateFile={onCreateFile}
            onRename={onRename}
          />
        </div>
      ))}
    </div>
  );
}

// 文件夹图标组件
const FolderIcon = ({ isOpen }: { isOpen: boolean }) => (
  <span className="mr-2 text-blue-500">
    {isOpen ? (
      <Icon name="lucide:folder-open" size={16} />
    ) : (
      <Icon name="lucide:folder" size={16} />
    )}
  </span>
);

// 文件图标组件
const FileIcon = ({ post }: { post: FileNode }) => (
  <span className="mr-2">
    {post.draft ? (
      <Icon name="lucide:file-text" size={16} />
    ) : (
      <Icon name="lucide:edit" size={16} />
    )}
  </span>
);

// 目录操作按钮组件
const DirectoryActions = ({
  directoryPath,
  source,
  onCreateFile,
  onRename,
}: {
  directoryPath: string;
  source: string;
  onCreateFile: (directoryPath: string, source: string) => void;
  onRename?: (path: string, source: string, type: "directory") => void;
}) => (
  <div className="ml-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCreateFile(directoryPath, source);
      }}
      className="w-6 h-6 flex items-center justify-center text-xs text-base-content/60 hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200"
      title="在此目录创建新文件"
    >
      +
    </button>
    {onRename && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRename(directoryPath, source, "directory");
        }}
        className="w-6 h-6 flex items-center justify-center text-xs text-base-content/60 hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200"
        title="重命名目录"
      >
        <Icon name="lucide:edit-3" size={12} />
      </button>
    )}
  </div>
);

// 文件操作按钮组件
const FileActions = ({
  filePath,
  source,
  onRename,
}: {
  filePath: string;
  source: string;
  onRename?: (path: string, source: string, type: "file") => void;
}) => (
  <div className="ml-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">
    {onRename && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRename(filePath, source, "file");
        }}
        className="w-6 h-6 flex items-center justify-center text-xs text-base-content/60 hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200"
        title="重命名文件"
      >
        <Icon name="lucide:edit-3" size={12} />
      </button>
    )}
  </div>
);

interface DirectoryTreeProps {
  onSelectFile: (filePath: string, fileName: string) => void;
  onCreateFile?: (directoryPath: string, fileName: string) => void;
  onContentSourceChange?: (contentSource: ContentSource | undefined) => void;
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

export function DirectoryTree({
  onSelectFile,
  onCreateFile,
  onContentSourceChange,
}: DirectoryTreeProps) {
  // 使用 Jotai 全局状态管理
  const [expandedFolders] = useAtom(expandedFoldersAtom);
  const [selectedFilePath] = useAtom(selectedFilePathAtom);
  const [scrollTarget] = useAtom(scrollTargetAtom);
  const toggleFolder = useSetAtom(toggleFolderAtom);
  const setSelectedFilePath = useSetAtom(setSelectedFilePathAtom);

  // 重命名相关状态
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    path: string;
    source: string;
    type: "file" | "directory";
    currentName: string;
  }>({
    open: false,
    path: "",
    source: "",
    type: "file",
    currentName: "",
  });

  // const [directoryContents, setDirectoryContents] = useState<Record<string, unknown[]>>({});

  // 监听滚动目标变化，实现自动滚动定位
  useEffect(() => {
    if (scrollTarget) {
      console.log(`[DirectoryTree] 滚动到目标文件: ${scrollTarget}`);

      // 查找对应的文件元素
      const fileElement = document.querySelector(`[data-file-path="${scrollTarget}"]`);
      if (fileElement) {
        fileElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        console.log(`[DirectoryTree] 成功滚动到文件: ${scrollTarget}`);
      } else {
        console.log(`[DirectoryTree] 未找到文件元素: ${scrollTarget}`);
      }
    }
  }, [scrollTarget]);

  // 监听选中文件变化，更新高亮状态
  useEffect(() => {
    if (selectedFilePath) {
      console.log(`[DirectoryTree] 选中文件变化: ${selectedFilePath}`);
    }
  }, [selectedFilePath]);

  // 获取数据源列表
  const { data: sources, isLoading: sourcesLoading } = trpc.admin.files.getSources.useQuery();

  // 重命名文件/目录的mutation
  const renameMutation = trpc.admin.files.renameFile.useMutation();

  // 用于刷新文件列表的工具
  const utils = trpc.useUtils();

  // 重命名后更新标签页的原子
  const updateTabsAfterRename = useSetAtom(updateTabsAfterRenameAtom);

  // 获取所有文章（临时保留，用于显示现有数据）
  const { data: posts, isLoading } = trpc.admin.posts.list.useQuery({
    page: 1,
    limit: 100,
    status: "all",
  });

  // 获取本地根目录内容
  const { data: localRootFiles } = trpc.admin.files.listDirectory.useQuery(
    { source: "local", path: "" },
    { enabled: sources?.some((s) => s.name === "local" && s.enabled) }
  );

  // 获取 WebDAV 根目录内容
  const { data: webdavRootFiles } = trpc.admin.files.listDirectory.useQuery(
    { source: "webdav", path: "" },
    { enabled: sources?.some((s) => s.name === "webdav" && s.enabled) }
  );

  // 处理文件选择
  const handleFileSelect = (post: FileNode) => {
    // 更新 Jotai 状态
    setSelectedFilePath(post.id);

    // 调用原有的回调
    onSelectFile(post.id, post.title);
  };

  // 切换文件夹展开状态
  const handleToggleFolder = (folderName: string) => {
    // 使用 Jotai 的切换方法
    toggleFolder(folderName);
  };

  // 处理创建文件
  const handleCreateFile = (directoryPath: string, source: string) => {
    const fileName = prompt("请输入文件名（不需要扩展名）:");
    if (!fileName) return;

    // 确保文件名以 .md 结尾
    const fullFileName = fileName.endsWith(".md") ? fileName : `${fileName}.md`;

    // 构建完整路径，处理路径分隔符
    let fullPath: string;
    if (source === "webdav") {
      // WebDAV 路径以 / 开头
      if (directoryPath === "") {
        fullPath = `/${fullFileName}`;
      } else {
        // 确保目录路径以 / 开头，但不以 / 结尾
        const normalizedDir = directoryPath.startsWith("/") ? directoryPath : `/${directoryPath}`;
        const cleanDir = normalizedDir.endsWith("/") ? normalizedDir.slice(0, -1) : normalizedDir;
        fullPath = `${cleanDir}/${fullFileName}`;
      }
    } else {
      // 本地路径不以 / 开头
      if (directoryPath === "") {
        fullPath = fullFileName;
      } else {
        // 移除开头的 / 并确保不以 / 结尾
        const cleanDir = directoryPath.startsWith("/") ? directoryPath.slice(1) : directoryPath;
        const normalizedDir = cleanDir.endsWith("/") ? cleanDir.slice(0, -1) : cleanDir;
        fullPath = `${normalizedDir}/${fullFileName}`;
      }
    }

    console.log("创建文件:", { directoryPath, source, fileName: fullFileName, fullPath });

    // 调用创建文件回调
    onCreateFile?.(fullPath, fullFileName);
  };

  // 处理重命名请求
  const handleRename = (path: string, source: string, type: "file" | "directory") => {
    // 从路径中提取当前名称
    const currentName = path.split("/").pop() || "";

    setRenameDialog({
      open: true,
      path,
      source,
      type,
      currentName,
    });
  };

  // 执行重命名
  const executeRename = async (newName: string) => {
    try {
      await renameMutation.mutateAsync({
        source: renameDialog.source,
        oldPath: renameDialog.path,
        newName,
      });

      // 更新相关的标签页信息
      updateTabsAfterRename(renameDialog.source, renameDialog.path, newName, onContentSourceChange);

      // 刷新相关的文件列表
      await utils.admin.files.listDirectory.invalidate({
        source: renameDialog.source,
      });

      console.log(`重命名成功: ${renameDialog.path} -> ${newName}`);
    } catch (error) {
      console.error("重命名失败:", error);
      throw error;
    }
  };

  if (isLoading || sourcesLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center">
          <span className="loading loading-spinner loading-sm"></span>
          <span className="ml-2 text-sm">加载文件...</span>
        </div>
      </div>
    );
  }

  if (!sources || sources.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-4xl mb-2">
          <Icon name="lucide:folder" size={48} />
        </div>
        <p className="text-gray-500 mb-2">暂无数据源</p>
        <p className="text-xs text-gray-400">请配置 WebDAV 或本地数据源</p>
      </div>
    );
  }

  // 按类型分组文章（临时保留，用于显示现有数据）
  const groupedPosts =
    posts?.posts?.reduce(
      (acc, post) => {
        const type = post.type || "post";
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push({
          ...post,
          publishDate: new Date(post.publishDate).toISOString(),
          updateDate: post.updateDate ? new Date(post.updateDate).toISOString() : undefined,
        } as FileNode);
        return acc;
      },
      {} as Record<string, FileNode[]>
    ) || {};

  return (
    <div className="h-full bg-base-100 border-r border-base-300 directory-tree-container overflow-y-auto">
      {/* 头部工具栏 */}
      <div className="p-3 border-b border-base-300 bg-base-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-base-content">文件管理器</h3>
        </div>
      </div>

      {/* 文件树 */}
      <div className="p-2">
        {/* 数据源列表 */}
        {sources.map((source) => {
          const isExpanded = expandedFolders.has(source.name);
          const sourceIcon =
            source.type === "webdav" ? (
              <Icon name="lucide:cloud" size={16} />
            ) : (
              <Icon name="lucide:save" size={16} />
            );

          return (
            <div key={source.name} className="mb-2">
              {/* 数据源文件夹 */}
              <div className="group flex items-center">
                <button
                  type="button"
                  className="flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm flex-1 text-left min-w-0"
                  onClick={() => handleToggleFolder(source.name)}
                  disabled={!source.enabled}
                >
                  <span className="mr-2">{sourceIcon}</span>
                  <FolderIcon isOpen={isExpanded} />
                  <span className="font-medium">{source.name}</span>
                  <span className="ml-auto text-xs text-base-content/60 text-right min-w-[4rem] mr-1">
                    {source.enabled ? source.type.toUpperCase() : "禁用"}
                  </span>
                </button>
                {source.enabled && (
                  <DirectoryActions
                    directoryPath=""
                    source={source.name}
                    onCreateFile={handleCreateFile}
                    onRename={handleRename}
                  />
                )}
              </div>

              {/* 数据源内容 */}
              {isExpanded && source.enabled && (
                <div className="ml-6 mt-1">
                  <div className="text-xs text-base-content/60 px-2 py-1">{source.description}</div>

                  {/* 显示 WebDAV 文件系统内容 */}
                  {source.name === "webdav" &&
                    sortFileItems(webdavRootFiles?.items || []).map((file) => (
                      <div key={file.path}>
                        <div className="group flex items-center w-full">
                          <button
                            type="button"
                            className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                              selectedFilePath === file.path ? "bg-primary/10 text-primary" : ""
                            }`}
                            onClick={() => {
                              if (file.type === "directory") {
                                // 目录：展开/折叠
                                handleToggleFolder(`webdav-${file.path}`);
                              } else {
                                // 文件：打开编辑
                                // 确保路径以单个斜杠开头
                                const normalizedPath = file.path.startsWith("/")
                                  ? file.path
                                  : `/${file.path}`;
                                onSelectFile?.(normalizedPath, file.name);
                              }
                            }}
                            title={file.name}
                          >
                            <span className="mr-2 flex-shrink-0">
                              {file.type === "directory" ? (
                                <Icon name="lucide:folder" size={16} />
                              ) : (
                                <Icon name="lucide:edit" size={16} />
                              )}
                            </span>
                            <span className="truncate flex-1">{file.name}</span>
                            {file.type === "file" && file.size ? (
                              <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                                {Math.round(file.size / 1024)}KB
                              </span>
                            ) : null}
                          </button>
                          {file.type === "directory" && (
                            <DirectoryActions
                              directoryPath={file.path}
                              source="webdav"
                              onCreateFile={handleCreateFile}
                              onRename={handleRename}
                            />
                          )}
                          {file.type === "file" && (
                            <FileActions
                              filePath={file.path}
                              source="webdav"
                              onRename={handleRename}
                            />
                          )}
                        </div>
                        <WebDAVSubDirectory
                          file={file}
                          source="webdav"
                          onSelectFile={onSelectFile}
                          selectedFilePath={selectedFilePath ?? undefined}
                          expandedFolders={expandedFolders}
                          toggleFolder={handleToggleFolder}
                          onCreateFile={handleCreateFile}
                          onRename={handleRename}
                        />
                      </div>
                    ))}

                  {/* 显示本地文件系统内容 */}
                  {source.name === "local" &&
                    sortFileItems(localRootFiles?.items || []).map((file) => (
                      <div key={file.path}>
                        <div className="group flex items-center w-full">
                          <button
                            type="button"
                            className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                              selectedFilePath === file.path ? "bg-primary/10 text-primary" : ""
                            }`}
                            onClick={() => {
                              if (file.type === "directory") {
                                // 目录：展开/折叠
                                handleToggleFolder(`local-${file.path}`);
                              } else {
                                // 文件：打开编辑
                                onSelectFile?.(file.path, file.name);
                              }
                            }}
                            title={file.name}
                            data-file-path={file.path}
                          >
                            <span className="mr-2 flex-shrink-0">
                              {file.type === "directory" ? (
                                <Icon name="lucide:folder" size={16} />
                              ) : (
                                <Icon name="lucide:edit" size={16} />
                              )}
                            </span>
                            <span className="truncate flex-1">{file.name}</span>
                            {file.type === "file" && file.size ? (
                              <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                                {Math.round(file.size / 1024)}KB
                              </span>
                            ) : null}
                          </button>
                          {file.type === "directory" && (
                            <DirectoryActions
                              directoryPath={file.path}
                              source="local"
                              onCreateFile={handleCreateFile}
                              onRename={handleRename}
                            />
                          )}
                          {file.type === "file" && (
                            <FileActions
                              filePath={file.path}
                              source="local"
                              onRename={handleRename}
                            />
                          )}
                        </div>
                        <LocalSubDirectory
                          file={file}
                          source="local"
                          onSelectFile={onSelectFile}
                          selectedFilePath={selectedFilePath ?? undefined}
                          expandedFolders={expandedFolders}
                          toggleFolder={handleToggleFolder}
                          onCreateFile={handleCreateFile}
                          onRename={handleRename}
                        />
                      </div>
                    ))}

                  {/* 显示现有文章数据（备用） */}
                  {source.name !== "webdav" &&
                    source.name !== "local" &&
                    Object.entries(groupedPosts).map(([type, files]) => {
                      const folderName =
                        type === "post"
                          ? "文章"
                          : type === "project"
                            ? "项目"
                            : type === "memo"
                              ? "闪念"
                              : type;
                      const subFolderExpanded = expandedFolders.has(`${source.name}-${type}`);

                      return (
                        <div key={`${source.name}-${type}`} className="mb-1">
                          {/* 子文件夹 */}
                          <button
                            type="button"
                            className="flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm w-full text-left"
                            onClick={() => handleToggleFolder(`${source.name}-${type}`)}
                          >
                            <FolderIcon isOpen={subFolderExpanded} />
                            <span className="font-medium">{folderName}</span>
                            <span className="ml-auto text-xs text-base-content/60">
                              {files.length}
                            </span>
                          </button>

                          {/* 文件列表 */}
                          {subFolderExpanded && (
                            <div className="ml-4 mt-1">
                              {files.map((post) => (
                                <button
                                  type="button"
                                  key={post.id}
                                  className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors w-full text-left ${
                                    selectedFilePath === post.id ? "bg-primary/10 text-primary" : ""
                                  }`}
                                  onClick={() => handleFileSelect(post)}
                                  title={post.title}
                                  data-file-path={post.id}
                                  data-scroll-id={generateScrollDataAttribute(post.id)}
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
                                <div className="px-2 py-1 text-xs text-base-content/50">
                                  暂无文件
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}

        {sources.length === 0 && (
          <div className="text-center py-8 text-base-content/50">
            <div className="text-2xl mb-2">
              <Icon name="lucide:folder" size={32} />
            </div>
            <p className="text-sm">暂无数据源</p>
            <p className="text-xs text-base-content/40 mt-1">请配置 WebDAV 或本地数据源</p>
          </div>
        )}
      </div>

      {/* 重命名对话框 */}
      <RenameDialog
        open={renameDialog.open}
        onOpenChange={(open) => setRenameDialog((prev) => ({ ...prev, open }))}
        currentName={renameDialog.currentName}
        itemType={renameDialog.type}
        onRename={executeRename}
      />
    </div>
  );
}
