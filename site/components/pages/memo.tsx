import { ClippingDetail } from "@clipping-reader";
import { PublicMemoDetailControlsIsland } from "@console-memo-authoring";
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
    structuredData,
  } = data;
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
      <section className="nature-detail-container memo-detail-layout px-2 py-8 sm:px-6 sm:py-10">
        <article className="nature-reading-measure space-y-8">
          {process.env.CONSOLE_RUNTIME === "true" ? (
            <PublicMemoDetailControlsIsland slug={memo.slug} />
          ) : null}
          <div data-public-memo-static-shell="">
            {clippingArticle ? (
              <ClippingDetail
                slug={memo.slug}
                memoContent={memoDetailContent}
                initialArticle={clippingArticle}
                header={heading}
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
                  />
                </div>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
