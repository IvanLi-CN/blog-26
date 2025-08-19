import type { Metadata } from "next";
import PostDetailPage from "../../../components/blog/PostDetailPage";

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    // 简化的 metadata 生成，避免在构建时访问数据库
    // 在生产环境中，这里可以使用静态数据或者缓存
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const postUrl = `${baseUrl}/posts/${slug}`;

    return {
      title: `${slug.replace(/-/g, " ")} - Ivan's Blog`,
      description: `阅读 Ivan Li 的文章：${slug.replace(/-/g, " ")}`,

      // 基础 meta 标签
      authors: [{ name: "Ivan Li" }],
      creator: "Ivan Li",
      publisher: "Ivan Li",

      // Open Graph
      openGraph: {
        type: "article",
        title: `${slug.replace(/-/g, " ")} - Ivan's Blog`,
        description: `阅读 Ivan Li 的文章：${slug.replace(/-/g, " ")}`,
        url: postUrl,
        siteName: "Ivan's Blog",
        locale: "zh_CN",
        images: [
          {
            url: `${baseUrl}/og-image.png`,
            width: 1200,
            height: 630,
            alt: `${slug.replace(/-/g, " ")} - Ivan's Blog`,
          },
        ],
        authors: ["Ivan Li"],
      },

      // Twitter Card
      twitter: {
        card: "summary_large_image",
        title: `${slug.replace(/-/g, " ")} - Ivan's Blog`,
        description: `阅读 Ivan Li 的文章：${slug.replace(/-/g, " ")}`,
        images: [`${baseUrl}/og-image.png`],
        creator: "@ivanli_cc",
        site: "@ivanli_cc",
      },

      // 机器人指令
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-video-preview": -1,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      },

      // 规范链接
      alternates: {
        canonical: postUrl,
      },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "文章加载失败 - Ivan's Blog",
      description: "文章信息加载失败，请稍后重试",
    };
  }
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  return <PostDetailPage slug={slug} />;
}
