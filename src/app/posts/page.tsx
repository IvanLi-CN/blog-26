import type { Metadata } from "next";
import { headers } from "next/headers";
import PostsListPage from "../../components/blog/PostsListPage";
import { isAdminFromRequest } from "../../lib/auth";
import { createSsrCaller } from "../../lib/trpc-ssr";
import { resolveTagIconSvgsForTags } from "../../server/services/tag-icon-ssr";

export const metadata: Metadata = {
  title: "文章列表 - Ivan's Blog",
  description: "浏览所有技术文章、生活感悟和思考分享",
  keywords: ["技术文章", "Web开发", "编程", "博客", "技术分享"],
};

export default async function PostsPage() {
  const h = await headers();
  const initialIsAdmin = await isAdminFromRequest(h);

  const caller = await createSsrCaller(h);
  const postsData = await caller.posts.list({ page: 1, limit: 10, published: true });

  const tagsForSsrIcons = (postsData.posts ?? []).flatMap((post) => post.tags ?? []);
  const { iconMap, svgMap } = await resolveTagIconSvgsForTags(tagsForSsrIcons, {
    svgHeight: "12",
    includeHashFallback: true,
  });

  return (
    <PostsListPage
      initialIsAdmin={initialIsAdmin}
      initialPosts={postsData}
      tagIconMap={iconMap}
      tagIconSvgMap={svgMap}
    />
  );
}
