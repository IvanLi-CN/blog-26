/**
 * 文章编辑器页面
 *
 * 完全模仿原项目的编辑器界面
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { EditorNavbar } from "../../../../components/editor/EditorNavbar";
import { PostEditorWrapper } from "../../../../components/editor/PostEditorWrapper";

export const metadata: Metadata = {
  title: "文章编辑器 - 管理后台",
  description: "多功能文章编辑器",
};

export default function EditorPage() {
  return (
    <div className="h-screen w-screen flex flex-col bg-base-200 fixed inset-0">
      {/* 编辑器专用导航栏 */}
      <EditorNavbar />

      {/* 编辑器主体 */}
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          }
        >
          <PostEditorWrapper />
        </Suspense>
      </div>
    </div>
  );
}
