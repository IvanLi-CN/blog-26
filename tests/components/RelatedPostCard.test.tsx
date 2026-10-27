import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RelatedPostCard from "../../site/components/RelatedPostCard";
import { createEmptyPublicMediaCollection } from "../../src/lib/public-media";
import type { PublicPostRecord } from "../../src/public-site/snapshot";

const legacyRelatedPost = {
  id: "legacy-related-post",
  slug: "legacy-related-post",
  title: "Legacy related post",
  excerpt: "Legacy related excerpt",
  body: "Legacy body",
  publishDate: "2026-10-01T00:00:00.000Z",
  updateDate: null,
  category: "Notes",
  tags: ["Notes"],
  author: "Tester",
  image: "/_content/assets/post/legacy-related-post/abc123/wm-b-v4/cover.webp",
  media: createEmptyPublicMediaCollection(),
  dataSource: "local",
  filePath: "Notes/legacy-related-post.md",
  metadata: {},
} satisfies PublicPostRecord;

const absoluteLegacyRelatedPost = {
  ...legacyRelatedPost,
  image:
    "https://blog.ivanli.cc/_content/assets/post/legacy-related-post/abc123/wm-b-v4/cover.webp",
} satisfies PublicPostRecord;

describe("RelatedPostCard", () => {
  test("maps a legacy public cover fallback to the clean card asset", () => {
    const markup = renderToStaticMarkup(
      createElement(RelatedPostCard, { post: legacyRelatedPost })
    );

    expect(markup).toContain("/_content/assets/post/legacy-related-post/abc123/card.webp");
    expect(markup).not.toContain("/wm-b-v4/cover.webp");
    expect(markup).toContain("object-cover");
    expect(markup).toContain("group-hover:scale-[1.04]");
  });

  test("maps an absolute same-site legacy cover fallback to the clean card asset", () => {
    const markup = renderToStaticMarkup(
      createElement(RelatedPostCard, { post: absoluteLegacyRelatedPost })
    );

    expect(markup).toContain(
      "https://blog.ivanli.cc/_content/assets/post/legacy-related-post/abc123/card.webp"
    );
    expect(markup).not.toContain("/wm-b-v4/cover.webp");
  });

  test("preserves an unrelated external cover URL", () => {
    const markup = renderToStaticMarkup(
      createElement(RelatedPostCard, {
        post: {
          ...absoluteLegacyRelatedPost,
          image: "https://images.example.test/cover.webp",
        },
      })
    );

    expect(markup).toContain("https://images.example.test/cover.webp");
  });
});
