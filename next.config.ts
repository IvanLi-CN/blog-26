import type { NextConfig } from "next";
import type { ExternalsFunctionElement } from "webpack";

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

  webpack(config, { isServer }) {
    if (isServer) {
      const externals: ExternalsFunctionElement[] = Array.isArray(config.externals)
        ? [...config.externals]
        : config.externals
          ? [config.externals as ExternalsFunctionElement]
          : [];

      externals.push((ctx, callback) => {
        const request = ctx.request ?? "";
        if (request.startsWith("bun:") || request.startsWith("node:")) {
          callback(undefined, `commonjs ${ctx.request}`);
          return;
        }
        callback();
      });

      config.externals = externals;
    }

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

  // Explicit Turbopack opt-in so Next 16 knows we're aware of the new default
  turbopack: {},

  // 实验性功能配置
  experimental: {
    mdxRs: false, // Use the legacy MDX compiler for better plugin compatibility
    authInterrupts: true,
  },

  async rewrites() {
    return [
      // Keep public endpoint at /mcp while serving from Next API route
      { source: "/mcp", destination: "/api/mcp" },
    ];
  },
};

// Wrap MDX and Next.js config with each other
export default nextConfig;
