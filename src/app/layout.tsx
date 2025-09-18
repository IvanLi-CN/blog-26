import type { Metadata } from "next";
import "./globals.css";
import { ProgressBar } from "../components/common/ProgressBar";
import { TRPCProvider } from "../components/providers/TRPCProvider";
import { SITE } from "../config/site";

// 强制动态渲染
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  keywords: SITE.keywords,
  authors: [{ name: SITE.author.name, url: SITE.url }],
  creator: SITE.author.name,
  publisher: SITE.author.name,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || SITE.url || "http://localhost:25090"),
  alternates: {
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: `${SITE.title} RSS Feed` }],
      "application/atom+xml": [{ url: "/atom.xml", title: `${SITE.title} Atom Feed` }],
      "application/feed+json": [{ url: "/feed.json", title: `${SITE.title} JSON Feed` }],
    },
  },
  openGraph: {
    type: SITE.seo.openGraph.type as "website",
    locale: SITE.seo.openGraph.locale,
    url: "/",
    siteName: SITE.seo.openGraph.siteName,
    title: SITE.title,
    description: SITE.description,
    images: [
      {
        url: SITE.images.default,
        width: 1200,
        height: 630,
        alt: SITE.title,
      },
    ],
  },
  twitter: {
    card: SITE.seo.twitter.card as "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    creator: SITE.seo.twitter.creator,
    images: [SITE.images.default],
  },
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="light">
      <head>
        {/* RSS Feed */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${SITE.title} RSS Feed`}
          href="/feed.xml"
        />
        <link
          rel="alternate"
          type="application/atom+xml"
          title={`${SITE.title} Atom Feed`}
          href="/atom.xml"
        />
        <link
          rel="alternate"
          type="application/feed+json"
          title={`${SITE.title} JSON Feed`}
          href="/feed.json"
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
        <ProgressBar />
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
