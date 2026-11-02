import { ClippingDetail } from "@clipping-reader";
import { PublicMemoDetailControlsIsland } from "@console-memo-authoring";
import CommentSectionWithProvider from "@/components/comments/CommentSectionWithProvider";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import type { loadmemo } from "../../lib/page-data/memo";
import MemoDetailHeading from "../MemoDetailHeading";

export default function MemoPage(data: Awaited<ReturnType<typeof loadmemo>>) {
  const {
    snapshot,
    memo,
    displayDate,
    metadataTitle,
    contentSource,
    publicMediaContext,
    memoDetailContent,
    clippingArticle,
    initialMemo,
    initialIsAdmin,
    structuredData,
    assetVersion,
  } = data;
  const isConsoleBuild = process.env.BLOG_BUILD_TARGET === "console";
  const heading = (
    <MemoDetailHeading
      memo={memo}
      metadataTitle={metadataTitle}
      displayDate={displayDate}
      tagIconMap={snapshot.tags.tagIconMap}
      tagIconSvgMap={snapshot.tags.tagIconSvgMap}
    />
  );
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <section
        className={`nature-detail-container memo-detail-layout ${
          isConsoleBuild ? "memo-detail-layout--console" : ""
        } ${
          clippingArticle ? "memo-detail-layout--clipping" : "memo-detail-layout--comments"
        } px-2 py-8 sm:px-6 sm:py-10`}
      >
        <article
          className={`nature-reading-measure space-y-8${
            clippingArticle ? "" : " memo-detail-main"
          }`}
        >
          {process.env.BLOG_BUILD_TARGET === "console" || process.env.WEB_DEMO_BUILD === "true" ? (
            <PublicMemoDetailControlsIsland
              slug={memo.slug}
              initialMemo={initialMemo}
              initialIsAdmin={initialIsAdmin}
              initialClippingArticle={clippingArticle}
              publicMediaContext={publicMediaContext}
              hideChat={!isConsoleBuild}
            />
          ) : null}
          <div data-public-memo-static-shell="">
            {clippingArticle ? (
              <ClippingDetail
                slug={memo.slug}
                memoId={memo.id}
                memoContent={memoDetailContent}
                initialArticle={clippingArticle}
                header={heading}
                publicMediaContext={publicMediaContext}
                publicAssetVersion={assetVersion}
                commentsTarget={isConsoleBuild ? undefined : { type: "memo", key: memo.slug }}
                hideChat={!isConsoleBuild}
              />
            ) : (
              <div
                className="nature-panel nature-mobile-reading-surface memo-detail-card px-4 py-5 sm:px-8 sm:py-7"
                data-testid="public-memo-detail-card"
              >
                {heading}
                <div className="mt-6">
                  <MarkdownRenderer
                    content={memoDetailContent}
                    variant="article"
                    enableMath={true}
                    enableMermaid={true}
                    enableCodeFolding={true}
                    removeTags={true}
                    rewritePublicSitePaths={true}
                    articlePath={memo.filePath}
                    contentSource={contentSource}
                    publicMediaContext={publicMediaContext}
                    publicAssetVersion={assetVersion}
                  />
                </div>
              </div>
            )}
          </div>
        </article>
        {!clippingArticle && (!isConsoleBuild || !initialIsAdmin) ? (
          <aside className="memo-detail-comments" data-public-memo-static-shell="">
            <CommentSectionWithProvider
              postSlug={memo.slug}
              target={{ type: "memo", key: memo.slug }}
              usePublicSitePaths={true}
            />
          </aside>
        ) : null}
      </section>
    </>
  );
}
