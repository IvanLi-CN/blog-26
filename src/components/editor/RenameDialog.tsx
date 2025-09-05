"use client";

import { useId, useState } from "react";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  itemType: "file" | "directory";
  onRename: (newName: string) => Promise<void>;
}

export function RenameDialog({
  open,
  onOpenChange,
  currentName,
  itemType,
  onRename,
}: RenameDialogProps) {
  const [newName, setNewName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  // 重置状态当对话框打开时
  const _handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setNewName(currentName);
      setError(null);
      setIsLoading(false);
    }
    onOpenChange(newOpen);
  };

  // 处理重命名
  const handleRename = async () => {
    const trimmedName = newName.trim();

    // 验证输入
    if (!trimmedName) {
      setError("名称不能为空");
      return;
    }

    if (trimmedName === currentName) {
      setError("新名称与当前名称相同");
      return;
    }

    // 检查非法字符
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(trimmedName)) {
      setError('名称包含非法字符: < > : " / \\ | ? *');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onRename(trimmedName);
      onOpenChange(false);
    } catch (error) {
      console.error("重命名失败:", error);
      setError(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 处理回车键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleRename();
    }
  };

  // 如果对话框未打开，不渲染任何内容
  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        {/* 标题区域 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg text-base-content">
              重命名{itemType === "directory" ? "目录" : "文件"}
            </h3>
            <p className="text-sm text-base-content/60">
              输入新的{itemType === "directory" ? "目录" : "文件"}名称
            </p>
          </div>
        </div>

        {/* 输入区域 */}
        <div className="form-control w-full mb-4">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">名称</span>
          </label>
          <input
            id={inputId}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="input input-bordered w-full"
            placeholder={`输入${itemType === "directory" ? "目录" : "文件"}名称`}
            disabled={isLoading}
          />
          {error && (
            <div className="label">
              <span className="label-text-alt text-error">{error}</span>
            </div>
          )}
        </div>

        {/* 按钮区域 */}
        <div className="modal-action">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="btn btn-ghost"
            disabled={isLoading}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleRename}
            className="btn btn-primary gap-2"
            disabled={isLoading || !newName.trim()}
          >
            {isLoading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                重命名中...
              </>
            ) : (
              <>
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                重命名
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
