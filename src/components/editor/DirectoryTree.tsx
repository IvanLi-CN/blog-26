"use client";

/**
 * 文件目录树组件
 *
 * 模仿原项目的文件管理器界面
 */

import { useState } from "react";
import { trpc } from "../../lib/trpc";

// 子目录内容组件
interface SubDirectoryContentProps {
  source: string;
  path: string;
  onSelectFile?: (path: string, name: string) => void;
  selectedPath?: string;
  expandedFolders: Set<string>;
  toggleFolder: (folderName: string) => void;
}

function _SubDirectoryContent({
  source,
  path,
  onSelectFile,
  selectedPath,
  expandedFolders: _expandedFolders,
  toggleFolder: _toggleFolder,
}: SubDirectoryContentProps) {
  // 获取子目录内容
  const { data: subDirFiles, isLoading } = trpc.admin.files.listDirectory.useQuery(
    { source, path },
    { enabled: true }
  );

  if (isLoading) {
    return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">加载中...</div>;
  }

  if (!subDirFiles?.items?.length) {
    return <div className="ml-4 text-xs text-base-content/60 px-2 py-1">空目录</div>;
  }

  return (
    <div className="ml-4 border-l border-base-300">
      {subDirFiles.items.map((file) => (
        <button
          key={file.path}
          type="button"
          className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors w-full text-left ${
            selectedPath === file.path ? "bg-primary/10 text-primary" : ""
          }`}
          onClick={() => {
            if (file.type === "directory") {
              // 子目录：展开/折叠
              _toggleFolder(`${source}-${path}/${file.path}`);
            } else {
              // 文件：打开编辑
              const fullPath =
                source === "webdav" ? `/${path}/${file.path}` : `${path}/${file.path}`;
              onSelectFile?.(fullPath, file.name);
            }
          }}
          title={file.name}
        >
          <span className="mr-2">{file.type === "directory" ? "📁" : "📝"}</span>
          <span className="truncate flex-1">{file.name}</span>
          {file.size && (
            <span className="ml-2 text-xs text-base-content/40">
              {Math.round(file.size / 1024)}KB
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// WebDAV 子目录组件
function WebDAVSubDirectory({
  file,
  source,
  onSelectFile,
  selectedPath,
  expandedFolders,
  toggleFolder,
  onCreateFile,
}: {
  file: any;
  source: string;
  onSelectFile?: (path: string, name: string) => void;
  selectedPath?: string;
  expandedFolders: Set<string>;
  toggleFolder: (folderName: string) => void;
  onCreateFile?: (directoryPath: string, source: string) => void;
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
      {subDirFiles.items.map((subFile) => (
        <div key={subFile.path}>
          <div className="group flex items-center w-full">
            <button
              type="button"
              className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                selectedPath === `/${subFile.path}` ? "bg-primary/10 text-primary" : ""
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
                {subFile.type === "directory" ? "📁" : "📝"}
              </span>
              <span className="truncate flex-1">{subFile.name}</span>
              {subFile.type === "directory" && onCreateFile && (
                <DirectoryActions
                  directoryPath={subFile.path}
                  source={source}
                  onCreateFile={onCreateFile}
                />
              )}
              {subFile.type === "directory" ? (
                <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[2rem] mr-1">
                  {subFile.count || 0}
                </span>
              ) : subFile.size ? (
                <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                  {Math.round(subFile.size / 1024)}KB
                </span>
              ) : null}
            </button>
          </div>
          {/* 递归渲染子目录 */}
          <WebDAVSubDirectory
            file={subFile}
            source={source}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onCreateFile={onCreateFile}
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
  selectedPath,
  expandedFolders,
  toggleFolder,
  onCreateFile,
}: {
  file: any;
  source: string;
  onSelectFile?: (path: string, name: string) => void;
  selectedPath?: string;
  expandedFolders: Set<string>;
  toggleFolder: (folderName: string) => void;
  onCreateFile?: (directoryPath: string, source: string) => void;
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
      {subDirFiles.items.map((subFile) => (
        <div key={subFile.path}>
          <div className="group flex items-center w-full">
            <button
              type="button"
              className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                selectedPath === `${file.path}/${subFile.path}` ? "bg-primary/10 text-primary" : ""
              }`}
              onClick={() => {
                if (subFile.type === "directory") {
                  // 子目录：展开/折叠
                  toggleFolder(`local-${file.path}/${subFile.path}`);
                } else {
                  // 文件：打开编辑
                  onSelectFile?.(`${file.path}/${subFile.path}`, subFile.name);
                }
              }}
              title={subFile.name}
            >
              <span className="mr-2 flex-shrink-0">
                {subFile.type === "directory" ? "📁" : "📝"}
              </span>
              <span className="truncate flex-1">{subFile.name}</span>
              {subFile.type === "directory" && onCreateFile && (
                <DirectoryActions
                  directoryPath={`${file.path}/${subFile.path}`}
                  source={source}
                  onCreateFile={onCreateFile}
                />
              )}
              {subFile.type === "directory" ? (
                <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[2rem] mr-1">
                  {subFile.count || 0}
                </span>
              ) : subFile.size ? (
                <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                  {Math.round(subFile.size / 1024)}KB
                </span>
              ) : null}
            </button>
          </div>
          {/* 递归渲染子目录 */}
          <LocalSubDirectory
            file={subFile}
            source={source}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onCreateFile={onCreateFile}
          />
        </div>
      ))}
    </div>
  );
}

// 文件夹图标组件
const FolderIcon = ({ isOpen }: { isOpen: boolean }) => (
  <span className="mr-2 text-blue-500">{isOpen ? "📂" : "📁"}</span>
);

// 文件图标组件
const FileIcon = ({ post }: { post: FileNode }) => (
  <span className="mr-2">{post.draft ? "📄" : "📝"}</span>
);

// 目录操作按钮组件
const DirectoryActions = ({
  directoryPath,
  source,
  onCreateFile,
}: {
  directoryPath: string;
  source: string;
  onCreateFile: (directoryPath: string, source: string) => void;
}) => (
  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center">
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
  </div>
);

interface DirectoryTreeProps {
  onSelectFile: (filePath: string) => void;
  onCreateFile?: (directoryPath: string, fileName: string) => void;
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["webdav"]));
  const [_directoryContents, _setDirectoryContents] = useState<Record<string, any[]>>({});

  // 获取数据源列表
  const { data: sources, isLoading: sourcesLoading } = trpc.admin.files.getSources.useQuery();

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
        <div className="text-4xl mb-2">📁</div>
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
        acc[type].push(post);
        return acc;
      },
      {} as Record<string, FileNode[]>
    ) || {};

  return (
    <div className="h-full bg-base-100 border-r border-base-300">
      {/* 头部工具栏 */}
      <div className="p-3 border-b border-base-300 bg-base-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-base-content">文件管理器</h3>
        </div>
      </div>

      {/* 文件树 */}
      <div className="p-2 overflow-y-auto h-full">
        {/* 数据源列表 */}
        {sources.map((source) => {
          const isExpanded = expandedFolders.has(source.name);
          const sourceIcon = source.type === "webdav" ? "☁️" : "💾";

          return (
            <div key={source.name} className="mb-2">
              {/* 数据源文件夹 */}
              <div className="group flex items-center">
                <button
                  type="button"
                  className="flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm flex-1 text-left min-w-0"
                  onClick={() => toggleFolder(source.name)}
                  disabled={!source.enabled}
                >
                  <span className="mr-2">{sourceIcon}</span>
                  <FolderIcon isOpen={isExpanded} />
                  <span className="font-medium">{source.name}</span>
                  {source.enabled && (
                    <DirectoryActions
                      directoryPath=""
                      source={source.name}
                      onCreateFile={handleCreateFile}
                    />
                  )}
                  <span className="ml-auto text-xs text-base-content/60 text-right min-w-[4rem] mr-1">
                    {source.enabled ? source.type.toUpperCase() : "禁用"}
                  </span>
                </button>
              </div>

              {/* 数据源内容 */}
              {isExpanded && source.enabled && (
                <div className="ml-6 mt-1">
                  <div className="text-xs text-base-content/60 px-2 py-1">{source.description}</div>

                  {/* 显示 WebDAV 文件系统内容 */}
                  {source.name === "webdav" &&
                    webdavRootFiles?.items?.map((file) => (
                      <div key={file.path}>
                        <div className="group flex items-center w-full">
                          <button
                            type="button"
                            className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                              selectedPath === file.path ? "bg-primary/10 text-primary" : ""
                            }`}
                            onClick={() => {
                              if (file.type === "directory") {
                                // 目录：展开/折叠
                                toggleFolder(`webdav-${file.path}`);
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
                              {file.type === "directory" ? "📁" : "📝"}
                            </span>
                            <span className="truncate flex-1">{file.name}</span>
                            {file.type === "directory" && (
                              <DirectoryActions
                                directoryPath={file.path}
                                source="webdav"
                                onCreateFile={handleCreateFile}
                              />
                            )}
                            {file.type === "directory" ? (
                              <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[2rem] mr-1">
                                {file.count || 0}
                              </span>
                            ) : file.size ? (
                              <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                                {Math.round(file.size / 1024)}KB
                              </span>
                            ) : null}
                          </button>
                        </div>
                        <WebDAVSubDirectory
                          file={file}
                          source="webdav"
                          onSelectFile={onSelectFile}
                          selectedPath={selectedPath}
                          expandedFolders={expandedFolders}
                          toggleFolder={toggleFolder}
                          onCreateFile={handleCreateFile}
                        />
                      </div>
                    ))}

                  {/* 显示本地文件系统内容 */}
                  {source.name === "local" &&
                    localRootFiles?.items?.map((file) => (
                      <div key={file.path}>
                        <div className="group flex items-center w-full">
                          <button
                            type="button"
                            className={`flex items-center px-2 py-1 hover:bg-base-200 cursor-pointer rounded text-sm transition-colors flex-1 text-left min-w-0 ${
                              selectedPath === file.path ? "bg-primary/10 text-primary" : ""
                            }`}
                            onClick={() => {
                              if (file.type === "directory") {
                                // 目录：展开/折叠
                                toggleFolder(`local-${file.path}`);
                              } else {
                                // 文件：打开编辑
                                onSelectFile?.(file.path, file.name);
                              }
                            }}
                            title={file.name}
                          >
                            <span className="mr-2 flex-shrink-0">
                              {file.type === "directory" ? "📁" : "📝"}
                            </span>
                            <span className="truncate flex-1">{file.name}</span>
                            {file.type === "directory" && (
                              <DirectoryActions
                                directoryPath={file.path}
                                source="local"
                                onCreateFile={handleCreateFile}
                              />
                            )}
                            {file.type === "directory" ? (
                              <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[2rem] mr-1">
                                {file.count || 0}
                              </span>
                            ) : file.size ? (
                              <span className="ml-auto text-xs text-base-content/40 flex-shrink-0 text-right min-w-[3rem] mr-1">
                                {Math.round(file.size / 1024)}KB
                              </span>
                            ) : null}
                          </button>
                        </div>
                        <LocalSubDirectory
                          file={file}
                          source="local"
                          onSelectFile={onSelectFile}
                          selectedPath={selectedPath}
                          expandedFolders={expandedFolders}
                          toggleFolder={toggleFolder}
                          onCreateFile={handleCreateFile}
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
                            onClick={() => toggleFolder(`${source.name}-${type}`)}
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
            <div className="text-2xl mb-2">📁</div>
            <p className="text-sm">暂无数据源</p>
            <p className="text-xs text-base-content/40 mt-1">请配置 WebDAV 或本地数据源</p>
          </div>
        )}
      </div>
    </div>
  );
}
