"use client";

/**
 * 临时测试页面 - 用于验证图片路径修复
 */

import { PostUniversalEditor } from "../../components/editor/PostUniversalEditor";

export default function TestEditorPage() {
  return (
    <div className="h-screen w-screen flex flex-col bg-base-200 fixed inset-0">
      <div className="bg-base-100 border-b border-base-300 p-4">
        <h1 className="text-xl font-bold">图片路径修复测试页面</h1>
        <p className="text-sm text-base-content/70">测试粘贴图片后源码模式下的路径显示</p>
      </div>

      <div className="flex-1 overflow-hidden">
        <PostUniversalEditor selectedPostId="test-image-fix" />
      </div>
    </div>
  );
}
