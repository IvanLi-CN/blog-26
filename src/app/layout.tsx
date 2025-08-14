import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "../components/providers/TRPCProvider";

export const metadata: Metadata = {
  title: "Ivan's Blog",
  description: "A modern personal blog system built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
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
