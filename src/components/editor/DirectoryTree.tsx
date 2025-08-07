import { useEffect, useRef, useState } from 'react';
import { trpc } from '~/lib/trpc-client';
import type { DirectoryTreeNode } from '~/lib/webdav';

interface DirectoryTreeProps {
  onSelectFile: (filePath: string) => void;
  onCreateFile: (filePath: string) => void;
  selectedPath?: string;
  onRefresh?: () => void;
}

interface TreeNodeProps {
  node: DirectoryTreeNode;
  level: number;
  onSelectFile: (filePath: string) => void;
  onCreateFile: (filePath: string) => void;
  selectedPath?: string;
  onCreateDirectory: (parentPath: string) => void;
  onDeleteDirectory: (path: string) => void;
  onRenameFile: (oldPath: string, newPath: string) => void;
  onDeleteFile: (filePath: string) => void;
}

function TreeNode({
  node,
  level,
  onSelectFile,
  onCreateFile,
  selectedPath,
  onCreateDirectory,
  onDeleteDirectory,
  onRenameFile,
  onDeleteFile,
}: TreeNodeProps) {
  // 从localStorage获取展开状态，默认全部折叠
  const getExpandedState = () => {
    try {
      const saved = localStorage.getItem('directoryTree-expanded');
      if (saved) {
        const expandedPaths = JSON.parse(saved) as string[];
        return expandedPaths.includes(node.path);
      }
    } catch (error) {
      console.warn('Failed to load expanded state from localStorage:', error);
    }
    return false; // 默认折叠全部目录
  };

  const [isExpanded, setIsExpanded] = useState(getExpandedState);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(node.name);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const isDirectory = node.type === 'directory';
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedPath === node.path;

  // 保存展开状态到localStorage
  const saveExpandedState = (expanded: boolean) => {
    try {
      const saved = localStorage.getItem('directoryTree-expanded');
      let expandedPaths: string[] = [];

      if (saved) {
        expandedPaths = JSON.parse(saved) as string[];
      }

      if (expanded) {
        // 添加到展开列表
        if (!expandedPaths.includes(node.path)) {
          expandedPaths.push(node.path);
        }
      } else {
        // 从展开列表中移除
        expandedPaths = expandedPaths.filter((path) => path !== node.path);
      }

      localStorage.setItem('directoryTree-expanded', JSON.stringify(expandedPaths));
    } catch (error) {
      console.warn('Failed to save expanded state to localStorage:', error);
    }
  };

  // 关闭上下文菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleClick = () => {
    if (isDirectory) {
      const newExpanded = !isExpanded;
      setIsExpanded(newExpanded);
      saveExpandedState(newExpanded);
    } else {
      // 只有点击 markdown 文件时才打开编辑器
      const isMarkdownFile = node.path.toLowerCase().endsWith('.md') || node.path.toLowerCase().endsWith('.markdown');
      if (isMarkdownFile) {
        onSelectFile(node.path);
      }
    }
  };

  const handleRename = () => {
    setIsEditing(true);
    setShowContextMenu(false);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  };

  const handleRenameSubmit = () => {
    if (editingName.trim() && editingName !== node.name) {
      const trimmedName = editingName.trim();
      // 检查新名称是否以 . 或 _ 开头
      if (trimmedName.startsWith('.') || trimmedName.startsWith('_')) {
        alert('文件/目录名不能以 . 或 _ 开头');
        setEditingName(node.name);
        setIsEditing(false);
        return;
      }
      const newPath = node.path.replace(node.name, trimmedName);
      onRenameFile(node.path, newPath);
    }
    setIsEditing(false);
  };

  const handleRenameCancel = () => {
    setEditingName(node.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  };

  const handleCreateDirectory = () => {
    const name = prompt('请输入目录名称:');
    if (name && name.trim()) {
      const trimmedName = name.trim();
      // 检查目录名是否以 . 或 _ 开头
      if (trimmedName.startsWith('.') || trimmedName.startsWith('_')) {
        alert('目录名不能以 . 或 _ 开头');
        setShowContextMenu(false);
        return;
      }
      const newPath = node.path === '/' ? `/${trimmedName}` : `${node.path}/${trimmedName}`;
      onCreateDirectory(newPath);
    }
    setShowContextMenu(false);
  };

  const handleCreateFile = () => {
    const name = prompt('请输入文件名称:');
    if (name && name.trim()) {
      const trimmedName = name.trim();
      // 检查文件名是否以 . 或 _ 开头
      if (trimmedName.startsWith('.') || trimmedName.startsWith('_')) {
        alert('文件名不能以 . 或 _ 开头');
        setShowContextMenu(false);
        return;
      }
      const newPath = node.path === '/' ? `/${trimmedName}` : `${node.path}/${trimmedName}`;
      onCreateFile(newPath);
    }
    setShowContextMenu(false);
  };

  const handleDeleteDirectory = () => {
    if (confirm(`确定要删除目录 "${node.name}" 吗？只能删除空目录。`)) {
      onDeleteDirectory(node.path);
    }
    setShowContextMenu(false);
  };

  const handleDeleteFile = () => {
    if (confirm(`确定要删除文件 "${node.name}" 吗？`)) {
      onDeleteFile(node.path);
    }
    setShowContextMenu(false);
  };

  return (
    <div>
      <div
        className={`flex items-center py-2 px-2 cursor-pointer hover:bg-base-300 transition-colors ${
          isSelected ? 'bg-primary/10 border-r-2 border-primary font-medium text-primary' : 'text-base-content'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {isDirectory && <span className="mr-1 text-gray-500 select-none">{isExpanded ? '▼' : '▶'}</span>}
        <span className="mr-2">{isDirectory ? '📁' : '📄'}</span>
        {isEditing ? (
          <input
            ref={editInputRef}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            className="text-sm bg-white dark:bg-gray-800 border border-blue-500 rounded px-1 flex-1"
          />
        ) : (
          <span className="text-sm truncate">{node.name}</span>
        )}
      </div>

      {/* 上下文菜单 */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 menu bg-base-100 border border-base-300 rounded-box shadow-lg py-1 min-w-[120px]"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
        >
          {isDirectory ? (
            <>
              <li>
                <button className="text-sm" onClick={handleCreateFile}>
                  新建文件
                </button>
              </li>
              <li>
                <button className="text-sm" onClick={handleCreateDirectory}>
                  新建目录
                </button>
              </li>
              {node.path !== '/' && (
                <li>
                  <button className="text-sm text-error" onClick={handleDeleteDirectory}>
                    删除目录
                  </button>
                </li>
              )}
            </>
          ) : (
            <>
              <li>
                <button className="text-sm" onClick={handleRename}>
                  重命名
                </button>
              </li>
              <li>
                <button className="text-sm text-error" onClick={handleDeleteFile}>
                  删除文件
                </button>
              </li>
            </>
          )}
        </div>
      )}

      {/* 子节点 */}
      {isDirectory && isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              selectedPath={selectedPath}
              onCreateDirectory={onCreateDirectory}
              onDeleteDirectory={onDeleteDirectory}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DirectoryTree({ onSelectFile, onCreateFile, selectedPath, onRefresh }: DirectoryTreeProps) {
  const [showRootContextMenu, setShowRootContextMenu] = useState(false);
  const [rootContextMenuPosition, setRootContextMenuPosition] = useState({ x: 0, y: 0 });
  const rootContextMenuRef = useRef<HTMLDivElement>(null);

  const { data: directoryTree, isLoading, refetch } = trpc.posts.getDirectoryTree.useQuery();

  const createDirectoryMutation = trpc.posts.createDirectory.useMutation({
    onSuccess: () => {
      refetch();
      onRefresh?.();
    },
    onError: (error) => {
      alert(`创建目录失败: ${error.message}`);
    },
  });

  const deleteDirectoryMutation = trpc.posts.deleteDirectory.useMutation({
    onSuccess: () => {
      refetch();
      onRefresh?.();
    },
    onError: (error) => {
      alert(`删除目录失败: ${error.message}`);
    },
  });

  const renameFileMutation = trpc.posts.renameFile.useMutation({
    onSuccess: () => {
      refetch();
      onRefresh?.();
    },
    onError: (error) => {
      alert(`重命名失败: ${error.message}`);
    },
  });

  const deleteFileMutation = trpc.posts.deleteFile.useMutation({
    onSuccess: () => {
      refetch();
      onRefresh?.();
    },
    onError: (error) => {
      alert(`删除文件失败: ${error.message}`);
    },
  });

  const handleCreateDirectory = (path: string) => {
    createDirectoryMutation.mutate({ path });
  };

  const handleDeleteDirectory = (path: string) => {
    deleteDirectoryMutation.mutate({ path });
  };

  const handleRenameFile = (oldPath: string, newPath: string) => {
    renameFileMutation.mutate({ oldPath, newPath });
  };

  const handleDeleteFile = (filePath: string) => {
    deleteFileMutation.mutate({ path: filePath });
  };

  const handleRootContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setRootContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowRootContextMenu(true);
  };

  const handleCreateRootFile = () => {
    const name = prompt('请输入文件名称:');
    if (name && name.trim()) {
      const trimmedName = name.trim();
      // 检查文件名是否以 . 或 _ 开头
      if (trimmedName.startsWith('.') || trimmedName.startsWith('_')) {
        alert('文件名不能以 . 或 _ 开头');
        return;
      }
      onCreateFile(`/${trimmedName}`);
    }
    setShowRootContextMenu(false);
  };

  const handleCreateRootDirectory = () => {
    const name = prompt('请输入目录名称:');
    if (name && name.trim()) {
      const trimmedName = name.trim();
      // 检查目录名是否以 . 或 _ 开头
      if (trimmedName.startsWith('.') || trimmedName.startsWith('_')) {
        alert('目录名不能以 . 或 _ 开头');
        return;
      }
      handleCreateDirectory(`/${trimmedName}`);
    }
    setShowRootContextMenu(false);
  };

  // 关闭根目录上下文菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootContextMenuRef.current && !rootContextMenuRef.current.contains(event.target as Node)) {
        setShowRootContextMenu(false);
      }
    };

    if (showRootContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showRootContextMenu]);

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">加载目录树...</p>
      </div>
    );
  }

  if (!directoryTree) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <p>无法加载目录树</p>
        <button onClick={() => refetch()} className="mt-2 text-blue-500 hover:text-blue-600 text-sm">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto relative" onContextMenu={handleRootContextMenu}>
      <div className="p-2 border-b bg-gray-50 dark:bg-gray-800">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">文件管理器</h3>
      </div>
      <div className="py-2">
        {directoryTree.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <div className="mb-2">📁</div>
            <p className="text-sm mb-2">暂无文件</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">WebDAV 目录为空或连接失败</p>
            <button
              onClick={() => refetch()}
              className="text-blue-500 hover:text-blue-600 text-sm px-3 py-1 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
            >
              重新加载
            </button>
          </div>
        ) : (
          directoryTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              level={0}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              selectedPath={selectedPath}
              onCreateDirectory={handleCreateDirectory}
              onDeleteDirectory={handleDeleteDirectory}
              onRenameFile={handleRenameFile}
              onDeleteFile={handleDeleteFile}
            />
          ))
        )}
      </div>

      {/* 根目录上下文菜单 */}
      {showRootContextMenu && (
        <div
          ref={rootContextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg py-1 min-w-[120px]"
          style={{
            left: rootContextMenuPosition.x,
            top: rootContextMenuPosition.y,
          }}
        >
          <button
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={handleCreateRootFile}
          >
            新建文件
          </button>
          <button
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={handleCreateRootDirectory}
          >
            新建目录
          </button>
        </div>
      )}
    </div>
  );
}
