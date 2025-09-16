"use client";

import PageLayout from "@/components/common/PageLayout";
import { MemoCard, type MemoCardData } from "@/components/memos/MemoCard";

const sampleMemo: MemoCardData = {
  id: "demo-1",
  slug: "demo-1",
  title: "演示 Memo",
  // 故意包含 base64 图片以触发异常提示
  content:
    "这是一个包含内嵌图片的演示，用于预览右上角 actions 区域。\n\n![](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjgwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iODAiIGZpbGw9IiNmZWQ5NWEiLz48L3N2Zz4=)",
  excerpt: "",
  isPublic: true,
  tags: ["UI", "Design"],
  author: "Admin",
  source: "webdav",
  createdAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
  isVectorized: true,
};

export default function DemoMemoCardPage() {
  return (
    <PageLayout>
      <section className="px-4 sm:px-6 py-8 sm:py-12 lg:py-16 mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">MemoCard Actions 预览</h1>
          <p className="text-base-content/70 text-sm mt-1">
            用于快速验证卡片右上角的 actions 区域样式
          </p>
        </div>

        <MemoCard
          memo={sampleMemo}
          showEditButton
          showDeleteButton
          showVisibilityIndicator
          maxContentLength={220}
          onEdit={() => alert("编辑回调触发")}
          onDelete={() => alert("删除回调触发")}
        />
      </section>
    </PageLayout>
  );
}
