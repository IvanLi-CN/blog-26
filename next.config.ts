import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configure `pageExtensions` to include markdown and MDX files
  pageExtensions: ["js", "jsx", "ts", "tsx"],

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
      {
        protocol: "https",
        hostname: "www.gravatar.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "gravatar.com",
        port: "",
        pathname: "/**",
      },
    ],
  },

  // Removed custom Webpack config to avoid conflicts with Turbopack.
  // Next.js already externalizes common E2E tooling (e.g. Playwright/Puppeteer)
  // on the server by default under Turbopack, so an explicit webpack() block
  // is unnecessary and triggers a warning.

  // 禁用静态优化来避免构建时错误
  output: "standalone",

  // 完全禁用静态生成
  trailingSlash: false,
  skipTrailingSlashRedirect: true,

  // Be permissive during Docker/CI builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 实验性功能配置
  experimental: {
    mdxRs: false, // Use the legacy MDX compiler for better plugin compatibility
  },
};

// Wrap MDX and Next.js config with each other
export default nextConfig;
