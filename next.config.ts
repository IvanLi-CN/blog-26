import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
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

  // 临时解决方案：使用开发模式配置

  // Webpack 配置以解决服务端渲染问题
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 在服务端构建时排除某些可能有问题的模块
      config.externals = config.externals || [];
      config.externals.push({
        puppeteer: "puppeteer",
        playwright: "playwright",
        "chrome-aws-lambda": "chrome-aws-lambda",
      });
    }

    // 处理 mermaid 相关的模块
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
    };

    return config;
  },

  // 尝试跳过有问题的静态生成
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },

  // 禁用静态优化来避免构建时错误
  output: "standalone",

  // 完全禁用静态生成
  trailingSlash: false,
  skipTrailingSlashRedirect: true,

  // 移除无效的 generateStaticParams 配置

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
      // 移除 rehype-mermaid，使用客户端渲染方案
    ],
  },
});

// Wrap MDX and Next.js config with each other
// 重新启用 MDX，但使用更安全的配置
export default withMDX(nextConfig);
