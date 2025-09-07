import type { Metadata } from "next";
import PostDetailPage from "../../../components/blog/PostDetailPage";
import { SITE } from "../../../config/site";

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
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:25090";
    const postUrl = `${baseUrl}/posts/${slug}`;

    return {
      title: `${slug.replace(/-/g, " ")} - ${SITE.title}`,
      description: `阅读 ${SITE.author.name} 的文章：${slug.replace(/-/g, " ")}`,

      // 基础 meta 标签
      authors: [{ name: SITE.author.name }],
      creator: SITE.author.name,
      publisher: SITE.author.name,

      // Open Graph
      openGraph: {
        type: "article",
        title: `${slug.replace(/-/g, " ")} - ${SITE.title}`,
        description: `阅读 ${SITE.author.name} 的文章：${slug.replace(/-/g, " ")}`,
        url: postUrl,
        siteName: SITE.seo.openGraph.siteName,
        locale: SITE.seo.openGraph.locale,
        images: [
          {
            url: `${baseUrl}${SITE.images.default}`,
            width: 1200,
            height: 630,
            alt: `${slug.replace(/-/g, " ")} - ${SITE.title}`,
          },
        ],
        authors: [SITE.author.name],
      },

      // Twitter Card
      twitter: {
        card: SITE.seo.twitter.card as "summary_large_image",
        title: `${slug.replace(/-/g, " ")} - ${SITE.title}`,
        description: `阅读 ${SITE.author.name} 的文章：${slug.replace(/-/g, " ")}`,
        images: [`${baseUrl}${SITE.images.default}`],
        creator: SITE.seo.twitter.creator,
        site: SITE.seo.twitter.site,
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
      title: `文章加载失败 - ${SITE.title}`,
      description: "文章信息加载失败，请稍后重试",
    };
  }
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  return <PostDetailPage slug={slug} />;
}
