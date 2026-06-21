import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AdminPreviewPost } from "@/lib/admin-api-client";
import { PostPreviewArticle, PreviewChrome, type PreviewPublicPageState } from "./preview";

const storyHero = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#132737" />
        <stop offset="52%" stop-color="#24516d" />
        <stop offset="100%" stop-color="#8fd0e8" />
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#hero)" />
    <circle cx="1180" cy="210" r="170" fill="rgba(255,255,255,0.14)" />
    <circle cx="340" cy="690" r="240" fill="rgba(225,245,255,0.12)" />
    <rect x="190" y="250" width="560" height="340" rx="38" fill="rgba(11,24,34,0.52)" stroke="rgba(255,255,255,0.2)" />
    <text x="250" y="360" fill="#eaf8ff" font-size="72" font-family="Georgia, serif" font-weight="700">USB-C Safe 5V</text>
    <text x="250" y="438" fill="#d6edf7" font-size="40" font-family="Georgia, serif">Admin preview draft evidence</text>
    <rect x="250" y="494" width="260" height="18" rx="9" fill="rgba(255,255,255,0.4)" />
    <rect x="250" y="530" width="198" height="18" rx="9" fill="rgba(255,255,255,0.22)" />
  </svg>
`)}`;

const sharedPost: AdminPreviewPost = {
  kind: "post",
  id: "blog/usb-c-safe-5v-sink.md",
  slug: "usb-c-safe-5v-sink",
  title: "USB-C 安全 5V Sink",
  body: `纯正文第一段。\n\n- 保持主图可见\n- 保持草稿 CTA 禁用说明可见`,
  excerpt: "面向作者态预览的摘要。",
  tags: ["usb-c", "sink"],
  category: "hardware",
  author: "Ivan Li",
  publishDate: "2026-06-20T08:00:00.000Z",
  updateDate: "2026-06-21T10:00:00.000Z",
  image: storyHero,
  draft: true,
  public: false,
  filePath: "blog/usb-c-safe-5v-sink.md",
  source: "local",
};

function PreviewStoryShell({
  post,
  publicPage,
}: {
  post: AdminPreviewPost;
  publicPage: PreviewPublicPageState;
}) {
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background p-6 text-foreground" data-ui-theme="light">
        <div className="mx-auto max-w-[1100px] space-y-6">
          <PreviewChrome
            title="文章预览"
            description="检查文章在公开站中的阅读效果。"
            publicPage={publicPage}
            onRefresh={() => {
              // Storybook uses a static preview state.
            }}
            refreshing={false}
          >
            <PostPreviewArticle post={post} />
          </PreviewChrome>
        </div>
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Admin/Pages/Preview",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PreviewStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DraftPublicCtaDisabled: Story = {
  name: "草稿禁用公开入口",
  render: () => (
    <PreviewStoryShell
      post={sharedPost}
      publicPage={{
        href: "/posts/usb-c-safe-5v-sink",
        enabled: false,
        disabledReason: "当前文章仍为草稿或未公开",
      }}
    />
  ),
};

export const PublishedPublicCtaEnabled: Story = {
  name: "已公开文章 CTA",
  render: () => (
    <PreviewStoryShell
      post={{
        ...sharedPost,
        draft: false,
        public: true,
      }}
      publicPage={{
        href: "/posts/usb-c-safe-5v-sink",
        enabled: true,
      }}
    />
  ),
};
