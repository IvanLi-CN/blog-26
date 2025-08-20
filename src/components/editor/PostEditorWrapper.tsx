"use client";

/**
 * 文章编辑器包装组件
 *
 * 处理 URL 参数，支持直接打开特定文章
 */

import { useSearchParams } from "next/navigation";
import { PostEditor } from "./PostEditor";

export function PostEditorWrapper() {
  const searchParams = useSearchParams();
  const postId = searchParams?.get("id");

  return <PostEditor initialPostId={postId || undefined} />;
}
