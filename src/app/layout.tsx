import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "../components/providers/TRPCProvider";

export const metadata: Metadata = {
  title: "Ivan's Blog",
  description: "Ivan Li 的个人博客，分享技术文章、项目经验和思考",
  keywords: ["技术博客", "编程", "前端开发", "后端开发", "Ivan Li"],
  authors: [{ name: "Ivan Li", url: "https://ivanli.cc" }],
  creator: "Ivan Li",
  publisher: "Ivan Li",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  alternates: {
    types: {
      'application/rss+xml': [
        { url: '/feed.xml', title: "Ivan's Blog RSS Feed" }
      ]
    }
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: '/',
    siteName: "Ivan's Blog",
    title: "Ivan's Blog",
    description: "Ivan Li 的个人博客，分享技术文章、项目经验和思考",
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: "Ivan's Blog",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Ivan's Blog",
    description: "Ivan Li 的个人博客，分享技术文章、项目经验和思考",
    creator: '@ivanli_cc',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* RSS Feed */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Ivan's Blog RSS Feed"
          href="/feed.xml"
        />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />

        {/* DNS Prefetch */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//www.google-analytics.com" />

        {/* Preconnect */}
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const defaultTheme = "system";
                const darkThemes = [
                  "dark", "synthwave", "halloween", "forest", "black",
                  "luxury", "dracula", "night", "coffee", "dim", "sunset",
                  "abyss"
                ];

                function applyTheme(theme) {
                  const d = document.documentElement;
                  let currentTheme = theme;

                  if (theme === "system") {
                    currentTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
                      ? "dark"
                      : "light";
                  }

                  d.setAttribute("data-theme", currentTheme);

                  const isDark = darkThemes.includes(currentTheme);
                  if (isDark) {
                    d.classList.add("dark");
                  } else {
                    d.classList.remove("dark");
                  }
                }

                // Apply theme immediately to prevent FOUC
                const theme = localStorage.getItem("theme") || defaultTheme;
                applyTheme(theme);
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
