import type { loadposts } from "../../lib/page-data/posts";
import { cssStyle } from "../../lib/react-template";
import PostCard from "../PostCard";
export default function postsPage(data: Awaited<ReturnType<typeof loadposts>>) {
  const { snapshot, assetVersion } = data;

  return (
    <section className="nature-container px-1 py-10 sm:px-6 sm:py-16 lg:py-20">
      <div className="mb-8 text-center sm:mb-12">
        <span className="nature-kicker justify-center">Archive</span>
        <h1 className="nature-title mt-4 text-4xl sm:text-5xl lg:text-6xl">文章</h1>
        <p className="nature-muted mx-auto mt-4 max-w-2xl text-base sm:text-lg">
          一些想法、记录、分享
        </p>
      </div>

      {snapshot.posts.length > 0 ? (
        <ul className="nature-mobile-reading-stream space-y-4 md:space-y-6">
          {snapshot.posts.map((post, index) => (
            <li
              key={post.slug}
              className="nature-mobile-reading-row animate-fade-in-up"
              style={cssStyle(`animation-delay: ${index * 80}ms`)}
            >
              <PostCard
                post={post}
                iconMap={snapshot.tags.tagIconMap}
                iconSvgMap={snapshot.tags.tagIconSvgMap}
                assetVersion={assetVersion}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="nature-empty">
          <p>暂无公开文章</p>
        </div>
      )}
    </section>
  );
}
