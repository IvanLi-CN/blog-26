"use client";

import BlogListItem from "./BlogListItem";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  body: string;
  image?: string;
  publishDate: number;
  author?: string;
  category?: string;
  tags?: string[];
  published: boolean;
  dataSource?: string; // 内容源：local/webdav
  isVectorized?: boolean; // 是否已完成向量化（当前模型且哈希匹配）
}

interface BlogListProps {
  posts: Post[];
  /** 可选的管理员标记（来自服务端首屏判定） */
  isAdmin?: boolean;
}

export default function BlogList({ posts, isAdmin }: BlogListProps) {
  return (
    <ul className="space-y-4 md:space-y-6">
      {posts.map((post, index) => (
        <li
          key={post.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <BlogListItem post={post} forceIsAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  );
}
