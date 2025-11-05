import Link from "next/link";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { decodeTagFromPath, getPostsByTag } from "@/server/services/tag-service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tag: string }>;
}

export default async function TagDetailPage({ params }: PageProps) {
  const { tag } = await params;
  const decoded = decodeTagFromPath(tag || "");
  const posts = await getPostsByTag(decoded, { includeDrafts: false, includeUnpublished: false });

  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-4xl">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="tabler:tag" className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold">#{decoded}</h1>
          <span className="text-base-content/60 text-sm">{posts.length} posts</span>
          <Link
            href={`/tags/${encodeURIComponent(decoded)}/feed.xml`}
            className="ml-auto text-sm text-primary hover:underline"
          >
            RSS
          </Link>
        </div>

        {posts.length === 0 ? (
          <p className="text-base-content/60">No posts yet.</p>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li
                key={p.slug}
                className="rounded-lg border border-base-content/10 bg-base-100/60 p-4"
              >
                <h2 className="text-lg font-semibold">
                  <Link href={`/posts/${p.slug}`} className="hover:underline">
                    {p.title}
                  </Link>
                </h2>
                {p.excerpt && <p className="mt-1 text-base-content/70">{p.excerpt}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8">
          <Link href="/tags" className="text-sm text-base-content/60 hover:underline">
            ← Back to tags
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
