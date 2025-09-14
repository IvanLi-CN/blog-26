import type { Metadata } from "next";
import SearchPageClient from "./SearchPageClient";

export const metadata: Metadata = {
  title: "搜索 | Ivan's Blog",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = typeof sp?.q === "string" ? sp.q : "";
  return (
    <main className="min-h-[60vh]">
      <div className="container mx-auto px-4">
        <div className="mx-auto w-full max-w-4xl py-6">
          <SearchPageClient initialQuery={q} />
        </div>
      </div>
    </main>
  );
}
