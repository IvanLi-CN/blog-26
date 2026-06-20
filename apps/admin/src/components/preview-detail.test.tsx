import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import {
  buildMemoPreviewMeta,
  buildPostPreviewMeta,
  buildPreviewHero,
  PreviewArticleShell,
} from "./preview-detail";

GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

describe("preview-detail helpers", () => {
  test("renders preview shell hero before body", () => {
    const { getByAltText, getByTestId } = render(
      <PreviewArticleShell
        title="文章标题"
        description="摘要"
        tags={["react", "admin"]}
        meta={buildPostPreviewMeta({
          publishDate: "2026-06-18T12:00:00.000Z",
          updateDate: "2026-06-19T12:00:00.000Z",
          author: "Ivan",
          category: "frontend",
          body: "Hello world",
        })}
        hero={buildPreviewHero("/cover.webp", "文章标题")}
        bodyTestId="admin-preview-post-body"
        body="# Hello"
        articlePath="blog/post.md"
        publicMediaContext={{
          kind: "post",
          slug: "post",
          filePath: "blog/post.md",
        }}
      />
    );

    const hero = getByTestId("admin-preview-hero");
    const body = getByTestId("admin-preview-post-body");
    expect(hero.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getByAltText("文章标题")).toBeTruthy();
  });

  test("omits description block when the preview surface should not show an excerpt", () => {
    const { queryByTestId } = render(
      <PreviewArticleShell
        title="Memo 标题"
        tags={["memo"]}
        meta={buildMemoPreviewMeta({
          createdAt: "2026-06-18T12:00:00.000Z",
          updatedAt: "2026-06-19T12:00:00.000Z",
          isPublic: true,
        })}
        bodyTestId="admin-preview-memo-body"
        body="正文"
        articlePath="Memos/demo.md"
        publicMediaContext={{
          kind: "memo",
          slug: "demo",
          filePath: "Memos/demo.md",
        }}
      />
    );

    expect(queryByTestId("admin-preview-description")).toBeNull();
  });

  test("memo meta keeps public/private and updated timing without excerpt", () => {
    const meta = buildMemoPreviewMeta({
      createdAt: "2026-06-18T12:00:00.000Z",
      updatedAt: "2026-06-19T12:00:00.000Z",
      isPublic: false,
    });

    expect(meta.some((item) => item.label.includes("私有 Memo"))).toBeTrue();
    expect(meta.some((item) => item.label.includes("更新于"))).toBeTrue();
  });

  test("memo preview shell stays hero-less even when memo content has images", () => {
    const { queryByTestId } = render(
      <PreviewArticleShell
        title="Memo 标题"
        tags={["memo"]}
        meta={buildMemoPreviewMeta({
          createdAt: "2026-06-18T12:00:00.000Z",
          updatedAt: "2026-06-19T12:00:00.000Z",
          isPublic: true,
        })}
        bodyTestId="admin-preview-memo-body"
        body={"![inline](./assets/inline.png)\n\n正文"}
        articlePath="Memos/demo.md"
        publicMediaContext={{
          kind: "memo",
          slug: "demo",
          filePath: "Memos/demo.md",
        }}
      />
    );

    expect(queryByTestId("admin-preview-hero")).toBeNull();
  });
});
