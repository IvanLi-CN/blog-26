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
  tags?: string;
  published: boolean;
  dataSource?: string; // 内容源：local/webdav
  isVectorized?: boolean; // 是否已完成向量化（当前模型且哈希匹配）
}

interface BlogListProps {
  posts: Post[];
}

export default function BlogList({ posts }: BlogListProps) {
  return (
    <ul className="space-y-4 md:space-y-6">
      {posts.map((post, index) => (
        <li
          key={post.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <BlogListItem post={post} />
        </li>
      ))}
    </ul>
  );
}
