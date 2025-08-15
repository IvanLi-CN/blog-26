import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeMermaid from "rehype-mermaid";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const nextConfig: NextConfig = {
  // Configure `pageExtensions` to include markdown and MDX files
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],

  // Configure images for external domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "via.placeholder.com",
        port: "",
        pathname: "/**",
      },
    ],
  },

  // Optionally, add any other Next.js config below
  experimental: {
    mdxRs: false, // Use the legacy MDX compiler for better plugin compatibility
  },
};

const withMDX = createMDX({
  // Add markdown plugins here, as desired
  options: {
    remarkPlugins: [remarkMath, remarkGfm],
    rehypePlugins: [
      rehypeHighlight,
      [
        rehypeKatex,
        {
          strict: "ignore", // 忽略严格模式警告
          throwOnError: false, // 遇到错误时不抛出异常
        },
      ],
      [
        rehypeMermaid,
        {
          strategy: "img-svg",
          dark: true,
          // 添加错误处理和超时配置
          launchOptions: {
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-gpu",
            ],
            timeout: 60000,
            headless: true,
          },
          // 添加错误处理回调
          errorFallback: (_element: any, diagram: string, error: Error) => {
            console.warn("Mermaid rendering error:", error.message);
            console.warn("Diagram content:", diagram);
            // 返回一个简单的代码块而不是 null
            return {
              type: "element",
              tagName: "pre",
              properties: { className: ["mermaid-error"] },
              children: [
                {
                  type: "element",
                  tagName: "code",
                  properties: {},
                  children: [{ type: "text", value: diagram }],
                },
              ],
            };
          },
        },
      ],
    ],
  },
});

// Wrap MDX and Next.js config with each other
export default withMDX(nextConfig);
