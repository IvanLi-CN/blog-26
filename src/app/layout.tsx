import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import "./nature-restored.css";
import "../lib/iconify-collections";
import { ProgressBar } from "../components/common/ProgressBar";
import { ThemeInit } from "../components/common/ThemeInit";
import { IconifyProvider } from "../components/providers/IconifyProvider";
import { ToastProvider } from "../components/providers/ToastProvider";
import { TRPCProvider } from "../components/providers/TRPCProvider";
import { SITE, UI } from "../config/site";

const bodyFont = Noto_Sans_SC({
  variable: "--font-body",
  weight: ["400", "500", "700"],
  preload: false,
});

const displayFont = Noto_Serif_SC({
  variable: "--font-display",
  weight: ["400", "500", "700"],
  preload: false,
});

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
    <html
      lang="zh-CN"
      suppressHydrationWarning
      data-ui-theme="light"
      data-ui-preference="system"
      data-theme="light"
      style={{ colorScheme: "light" }}
    >
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

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const defaultTheme = ${JSON.stringify(UI.theme.default)};
                const legacyLightThemes = ${JSON.stringify(UI.theme.legacyLight)};
                const legacyDarkThemes = ${JSON.stringify(UI.theme.legacyDark)};

                function normalizeTheme(theme) {
                  if (theme === "dark" || legacyDarkThemes.includes(theme)) return "dark";
                  if (theme === "light" || legacyLightThemes.includes(theme)) return "light";
                  return "system";
                }

                function resolveTheme(theme) {
                  const normalizedTheme = normalizeTheme(theme);
                  if (normalizedTheme === "dark") return "dark";
                  if (normalizedTheme === "light") return "light";
                  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
                }

                function applyTheme(theme) {
                  const d = document.documentElement;
                  const normalizedTheme = normalizeTheme(theme);
                  const resolvedTheme = resolveTheme(normalizedTheme);
                  d.setAttribute("data-ui-theme", resolvedTheme);
                  d.setAttribute("data-ui-preference", normalizedTheme);
                  d.setAttribute("data-theme", resolvedTheme);
                  d.classList.toggle("dark", resolvedTheme === "dark");
                  d.style.colorScheme = resolvedTheme;
                  if (theme !== normalizedTheme) {
                    localStorage.setItem("theme", normalizedTheme);
                  }
                }

                const theme = localStorage.getItem("theme") || defaultTheme;
                applyTheme(theme);
              })();
            `,
          }}
        />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
        <ThemeInit />
        <IconifyProvider />
        <ProgressBar />
        <TRPCProvider>{children}</TRPCProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
