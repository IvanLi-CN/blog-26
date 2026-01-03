import type { Metadata } from "next";
import { headers } from "next/headers";
import AboutPage from "../../components/blog/AboutPage";
import { createSsrCaller } from "../../lib/trpc-ssr";

export const metadata: Metadata = {
  title: "关于我 - Ivan's Blog",
  description: "了解更多关于 Ivan 的信息，包括技术背景、工作经验和个人兴趣",
  keywords: ["Ivan", "全栈开发", "Web开发", "技术博客", "关于"],
};

export default async function About() {
  const h = await headers();
  const caller = await createSsrCaller(h);
  const stats = await caller.posts.stats().catch(() => undefined);
  return <AboutPage stats={stats} />;
}
