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

  // 强制动态渲染
  experimental: {
    // Enable instrumentation hook so instrumentation.ts runs on startup
    instrumentationHook: true,
    mdxRs: false, // Use the legacy MDX compiler for better plugin compatibility
  },
};

// Wrap MDX and Next.js config with each other
export default nextConfig;
