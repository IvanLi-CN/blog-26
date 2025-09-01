"use client";

/**
 * 文章编辑器包装组件
 *
 * 处理 URL 参数，支持直接打开特定文章
 * 作为兼容层，将 id/slug 参数转换为标准化的内容源信息
 */

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "../../lib/trpc";
import { PostEditor } from "./PostEditor";

// 标准化的内容源信息
export interface ContentSource {
  source: "database" | "webdav" | "local";
  filePath: string;
  id?: string; // 原始 id，用于兼容
}

export function PostEditorWrapper() {
  const searchParams = useSearchParams();
  const postId = searchParams?.get("id");
  const postSlug = searchParams?.get("slug");

  const [contentSource, setContentSource] = useState<ContentSource | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 通过 slug 查询文章
  const {
    data: postBySlug,
    isLoading: slugLoading,
    error: slugError,
  } = trpc.admin.posts.getBySlug.useQuery(
    { slug: postSlug || "" },
    { enabled: !!postSlug && !postId } // 只有在有 slug 且没有 id 时才查询
  );

  // 处理参数转换为内容源信息
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    try {
      if (postId) {
        // 优先处理 id 参数（向后兼容）
        const source = convertIdToContentSource(postId);
        setContentSource(source);
      } else if (postBySlug) {
        // 处理通过 slug 查询到的文章
        const source = convertPostToContentSource(postBySlug);
        setContentSource(source);
      } else if (postSlug && !slugLoading && !postBySlug) {
        // slug 查询完成但没找到文章
        setError(`未找到 slug 为 "${postSlug}" 的文章`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "参数解析失败");
    } finally {
      setIsLoading(false);
    }
  }, [postId, postBySlug, postSlug, slugLoading]);

  // 处理 slug 查询错误
  useEffect(() => {
    if (slugError) {
      setError(slugError.message);
      setIsLoading(false);
    }
  }, [slugError]);

  // 显示加载状态
  if (isLoading || slugLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
        <span className="ml-2">正在加载文章...</span>
      </div>
    );
  }

  // 显示错误状态
  if (error) {
    return (
      <div className="h-full flex items-center justify-center flex-col">
        <div className="text-error mb-4">{error}</div>
        <button type="button" className="btn btn-primary" onClick={() => window.history.back()}>
          返回
        </button>
      </div>
    );
  }

  return <PostEditor initialContentSource={contentSource} />;
}

/**
 * 将旧的 id 参数转换为内容源信息（向后兼容）
 */
function convertIdToContentSource(id: string): ContentSource {
  // 判断 id 的格式来确定内容源类型
  if (id.startsWith("/")) {
    // WebDAV 文件
    return {
      source: "webdav",
      filePath: id,
      id,
    };
  } else if (id.includes("/") || id.endsWith(".md")) {
    // 本地文件
    return {
      source: "local",
      filePath: id,
      id,
    };
  } else {
    // 数据库文章
    return {
      source: "database",
      filePath: id, // 对于数据库文章，filePath 就是 id
      id,
    };
  }
}

/**
 * 将文章记录转换为内容源信息
 */
function convertPostToContentSource(post: {
  id: string;
  source?: string | null;
  dataSource?: string | null;
  filePath?: string | null;
}): ContentSource {
  // 根据文章的 source 和 dataSource 字段确定内容源
  const source = post.source || post.dataSource || "database";
  const sourceType =
    source === "local" ? "local" : source.startsWith("webdav") ? "webdav" : "database";

  // 处理文件路径
  let filePath = post.filePath || post.id;

  // 对于 WebDAV 文件，确保路径以 / 开头
  if (sourceType === "webdav" && filePath && !filePath.startsWith("/")) {
    filePath = `/${filePath}`;
  }

  return {
    source: sourceType,
    filePath: filePath,
    id: post.id,
  };
}
