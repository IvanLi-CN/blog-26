"use client";

/**
 * 编辑器功能测试页面
 *
 * 用于验证新实现的编辑器功能：
 * 1. 标签页高亮状态
 * 2. URL 状态同步
 * 3. 文件树智能展开
 * 4. 滚动定位功能
 */

import { Suspense } from "react";
import { EditorStateProvider } from "../../components/editor/EditorStateContext";
import { useAdvancedEditorState } from "../../components/editor/hooks/useEditorState";
import { createContentSource } from "../../components/editor/utils/pathUtils";
import { scrollToFileInTree } from "../../components/editor/utils/scrollUtils";

function TestEditorContent() {
  const editorState = useAdvancedEditorState();

  // 测试数据
  const testFiles = [
    {
      id: "/posts/tech/article1.md",
      title: "技术文章1",
      content: "# 技术文章1\n\n这是第一篇技术文章...",
    },
    { id: "/posts/life/diary.md", title: "生活日记", content: "# 生活日记\n\n今天天气不错..." },
    { id: "/projects/blog.md", title: "博客项目", content: "# 博客项目\n\n这是我的博客项目..." },
    {
      id: "database-article-1",
      title: "数据库文章",
      content: "# 数据库文章\n\n关于数据库的内容...",
    },
  ];

  const handleOpenFile = (file: (typeof testFiles)[0]) => {
    const contentSource = createContentSource(file.id);
    editorState.openFile(contentSource, file.title, file.content);
  };

  const handleTestScroll = (filePath: string) => {
    scrollToFileInTree(filePath);
  };

  return (
    <div className="min-h-screen bg-base-200 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">编辑器功能测试页面 🐾</h1>

        {/* 状态显示 */}
        <div className="bg-base-100 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">当前状态</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <strong>活动标签页:</strong> {editorState.activeTabId || "无"}
            </div>
            <div>
              <strong>标签页数量:</strong> {editorState.tabs.length}
            </div>
            <div>
              <strong>选中路径:</strong> {editorState.selectedPath || "无"}
            </div>
            <div>
              <strong>当前 Slug:</strong> {editorState.currentSlug || "无"}
            </div>
          </div>

          {/* 展开的文件夹 */}
          <div className="mt-4">
            <strong>展开的文件夹:</strong>
            <div className="flex flex-wrap gap-2 mt-2">
              {Array.from(editorState.expandedFolders).map((folder) => (
                <span key={folder} className="badge badge-outline">
                  {folder}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 测试按钮 */}
        <div className="bg-base-100 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">测试操作</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {testFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleOpenFile(file)}
              >
                打开 {file.title}
              </button>
            ))}
          </div>

          <div className="divider">滚动测试</div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {testFiles.map((file) => (
              <button
                key={`scroll-${file.id}`}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleTestScroll(file.id)}
              >
                滚动到 {file.title}
              </button>
            ))}
          </div>

          <div className="divider">状态管理测试</div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-error btn-sm"
              onClick={() => editorState.resetState()}
            >
              重置状态
            </button>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={() => {
                if (editorState.activeTabId) {
                  editorState.closeTabWithConfirm(editorState.activeTabId);
                }
              }}
            >
              关闭当前标签页
            </button>
            <button
              type="button"
              className="btn btn-info btn-sm"
              onClick={() => editorState.saveAllTabs()}
            >
              保存所有标签页
            </button>
          </div>
        </div>

        {/* 标签页显示 */}
        <div className="bg-base-100 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">标签页预览</h2>

          {editorState.tabs.length === 0 ? (
            <p className="text-base-content/60">暂无打开的标签页</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-4">
              {editorState.tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`btn btn-sm transition-all duration-200 ${
                    tab.id === editorState.activeTabId
                      ? "editor-tab-active bg-primary text-primary-content shadow-md"
                      : "btn-outline hover:shadow-sm"
                  }`}
                  onClick={() => editorState.setActiveTab(tab.id)}
                >
                  {tab.isDirty && <span className="mr-1">●</span>}
                  {tab.title}
                  <button
                    type="button"
                    className="ml-2 hover:text-error"
                    onClick={(e) => {
                      e.stopPropagation();
                      editorState.closeTabWithConfirm(tab.id);
                    }}
                  >
                    ✕
                  </button>
                </button>
              ))}
            </div>
          )}

          {/* 当前标签页内容 */}
          {editorState.activeTabId && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">当前标签页内容:</h3>
              <div className="bg-base-200 p-4 rounded-lg">
                <pre className="text-sm overflow-auto max-h-40">
                  {editorState.getActiveTab()?.content || "无内容"}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* 模拟文件树 */}
        <div className="bg-base-100 rounded-lg p-4 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">模拟文件树</h2>
          <div className="directory-tree-container max-h-60 overflow-y-auto border rounded p-2">
            {testFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`flex items-center p-2 rounded cursor-pointer transition-colors w-full text-left ${
                  editorState.selectedPath === file.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-base-200"
                }`}
                data-file-path={file.id}
                onClick={() => handleOpenFile(file)}
              >
                <span className="mr-2">📄</span>
                <span className="flex-1">{file.title}</span>
                <span className="text-xs text-base-content/60">{file.id}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base-200 p-4" />}>
      <EditorStateProvider>
        <TestEditorContent />
      </EditorStateProvider>
    </Suspense>
  );
}
