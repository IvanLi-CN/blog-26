import { headers } from "next/headers";
import HomePage from "../components/home/HomePage";
import { createSsrCaller } from "../lib/trpc-ssr";
import { resolveTagIconSvgsForTags } from "../server/services/tag-icon-ssr";

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
      }
    } catch {
      // ignore JSON parse errors and fall back to comma-separated parsing
    }

    return trimmed
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

export default async function Home() {
  const h = await headers();
  const caller = await createSsrCaller(h);
  const [postsData, memosData] = await Promise.all([
    caller.posts.list({ page: 1, limit: 10, published: true }),
    caller.memos.list({ limit: 5, publicOnly: true }),
  ]);

  const tagsForSsrIcons = [
    ...(postsData.posts ?? []).flatMap((post) => (post.tags ?? []).slice(0, 3)),
    ...(memosData.memos ?? []).flatMap((memo) =>
      normalizeTags((memo as { tags?: unknown }).tags).slice(0, 3)
    ),
  ];

  const { iconMap, svgMap } = await resolveTagIconSvgsForTags(tagsForSsrIcons, {
    svgHeight: "12",
    includeHashFallback: true,
  });

  return (
    <HomePage
      initialPosts={postsData}
      initialMemos={memosData}
      tagIconMap={iconMap}
      tagIconSvgMap={svgMap}
    />
  );
}
