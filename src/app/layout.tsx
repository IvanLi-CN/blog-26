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
      <body className="font-sans antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
