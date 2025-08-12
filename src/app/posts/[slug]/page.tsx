import type { Metadata } from "next";
import PostDetailPage from "../../../components/blog/PostDetailPage";

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // 这里可以调用 API 获取文章信息来生成 metadata
  // 暂时使用默认值
  return {
    title: `${slug} - Ivan's Blog`,
    description: "文章详情页面",
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  return <PostDetailPage slug={slug} />;
}
