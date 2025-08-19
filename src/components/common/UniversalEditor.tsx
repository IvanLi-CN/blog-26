"use client";

/**
 * 通用编辑器组件
 *
 * 支持多标签页、多种编辑模式的编辑器界面
 */

import { useCallback } from "react";

export type EditorMode = "wysiwyg" | "source" | "preview";

export interface EditorTab {
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
  mode: EditorMode;
}

interface UniversalEditorProps {
  tabs: EditorTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  // onContentChange: (tabId: string, content: string) => void;
  onModeChange: (tabId: string, mode: EditorMode) => void;
  onSave: (tabId: string) => void;
  children: React.ReactNode;
}

export function UniversalEditor({
  tabs,
  activeTabId,
  onTabChange,
  onTabClose,
  // onContentChange,
  onModeChange,
  onSave,
  children,
}: UniversalEditorProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  // 处理标签页切换
  const handleTabClick = (tabId: string) => {
    onTabChange(tabId);
  };

  // 处理标签页关闭
  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  // 处理模式切换
  const handleModeChange = (mode: EditorMode) => {
    if (activeTab) {
      onModeChange(activeTab.id, mode);
    }
  };

  // 处理保存
  const handleSave = useCallback(() => {
    if (activeTab) {
      onSave(activeTab.id);
    }
  }, [activeTab, onSave]);

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "s":
            e.preventDefault();
            handleSave();
            break;
          case "w":
            if (activeTab) {
              e.preventDefault();
              onTabClose(activeTab.id);
            }
            break;
        }
      }
    },
    [activeTab, onTabClose, handleSave]
  );

  return (
    <div
      className="h-full flex flex-col bg-base-100"
      onKeyDown={handleKeyDown}
      role="application"
      tabIndex={-1}
    >
      {/* 标签页栏 */}
      <div className="flex items-center bg-base-200 border-b border-base-300 min-h-[40px]">
        <div className="flex-1 flex items-center overflow-x-auto">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`flex items-center px-3 py-2 border-r border-base-300 cursor-pointer hover:bg-base-100 transition-colors min-w-0 ${
                tab.id === activeTabId ? "bg-base-100 text-primary" : "text-base-content/70"
              }`}
              onClick={() => handleTabClick(tab.id)}
            >
              <span className="truncate max-w-[150px]" title={tab.title}>
                {tab.title}
              </span>
              {tab.isDirty && (
                <span className="ml-1 text-warning" title="未保存">
                  ●
                </span>
              )}
              <button
                type="button"
                className="ml-2 hover:bg-base-300 rounded p-1 text-xs opacity-60 hover:opacity-100"
                onClick={(e) => handleTabClose(e, tab.id)}
                title="关闭标签页"
              >
                ✕
              </button>
            </button>
          ))}
        </div>

        {/* 工具栏 */}
        {activeTab && (
          <div className="flex items-center px-3 gap-2">
            {/* 编辑模式切换 */}
            <div className="join">
              <button
                type="button"
                className={`btn btn-xs join-item ${activeTab.mode === "wysiwyg" ? "btn-primary" : "btn-outline"}`}
                onClick={() => handleModeChange("wysiwyg")}
                title="所见即所得"
              >
                📝
              </button>
              <button
                type="button"
                className={`btn btn-xs join-item ${activeTab.mode === "source" ? "btn-primary" : "btn-outline"}`}
                onClick={() => handleModeChange("source")}
                title="源码编辑"
              >
                &lt;/&gt;
              </button>
              <button
                type="button"
                className={`btn btn-xs join-item ${activeTab.mode === "preview" ? "btn-primary" : "btn-outline"}`}
                onClick={() => handleModeChange("preview")}
                title="预览"
              >
                👁️
              </button>
            </div>

            {/* 保存按钮 */}
            <button
              type="button"
              className={`btn btn-xs ${activeTab.isDirty ? "btn-primary" : "btn-outline"}`}
              onClick={handleSave}
              title="保存 (Ctrl+S)"
            >
              💾
            </button>
          </div>
        )}
      </div>

      {/* 编辑器内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <div className="h-full">{children}</div>
        ) : (
          <div className="h-full flex items-center justify-center text-base-content/50">
            <div className="text-center">
              <div className="text-4xl mb-4">📝</div>
              <p>选择一个文件开始编辑</p>
              <p className="text-sm mt-2">或者创建一个新文件</p>
            </div>
          </div>
        )}
      </div>

      {/* 状态栏 */}
      {activeTab && (
        <div className="bg-base-200 border-t border-base-300 px-3 py-1 text-xs text-base-content/70 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>
              模式:{" "}
              {activeTab.mode === "wysiwyg"
                ? "所见即所得"
                : activeTab.mode === "source"
                  ? "源码"
                  : "预览"}
            </span>
            <span>字符数: {activeTab.content.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {activeTab.isDirty && <span className="text-warning">未保存</span>}
            <span>Ctrl+S 保存 • Ctrl+W 关闭</span>
          </div>
        </div>
      )}
    </div>
  );
}
