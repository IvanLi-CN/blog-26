import type { Metadata } from "next";
import PostsListPage from "../../components/blog/PostsListPage";

export const metadata: Metadata = {
  title: "文章列表 - Ivan's Blog",
  description: "浏览所有技术文章、生活感悟和思考分享",
  keywords: ["技术文章", "Web开发", "编程", "博客", "技术分享"],
};

export default function PostsPage() {
  return <PostsListPage />;
}
