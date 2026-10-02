import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MemoCard, { type MemoCardRecord } from "../../site/components/MemoCard";

const memo: MemoCardRecord = {
  id: "memo-prefetch-test",
  slug: "memo-prefetch-test",
  title: "Prefetch test",
  excerpt: "Memo card used to verify link prefetch behavior.",
  tags: ["Web Demo"],
  isPublic: true,
  createdAt: "2026-09-30T12:00:00.000Z",
  publishedAt: null,
};

describe("MemoCard", () => {
  test("disables link prefetch when requested by the Web Demo", () => {
    const markup = renderToStaticMarkup(createElement(MemoCard, { memo, disablePrefetch: true }));
    const links = [...markup.matchAll(/<a\b([^>]*)>/g)];

    expect(links.length).toBeGreaterThan(0);
    expect(
      links.every(([, attributes]) => attributes.includes('data-astro-prefetch="false"'))
    ).toBe(true);
  });
});
