import { PublicMemoComposerIsland } from "@console-memo-authoring";
import type { loadmemos } from "../../lib/page-data/memos";
import MemoTimeline from "../MemoTimeline";
export default function memosPage(data: Awaited<ReturnType<typeof loadmemos>>) {
  const {
    isMemoListWebDemo,
    snapshot,
    isConsoleRuntime,
    initialIsAdmin,
    initialAuthorMemos,
    initialMemosHasMore,
    initialMemosNextCursor,
    initialMemosHasNewer,
    initialMemosPreviousCursor,
    initialMemosError,
    localSourceEnabled,
    localMemoRootPath,
    renderedMemos,
    renderedMemosHasMore,
    renderedMemosNextCursor,
  } = data;

  return (
    <section className="nature-container memo-stream-page px-1 py-8 sm:px-6 sm:py-12 lg:py-16">
      <div className="mb-8 text-center sm:mb-12">
        <span className="nature-kicker justify-center">
          {isMemoListWebDemo ? "Interactive Web Demo" : "Flow Notes"}
        </span>
        <h1 className="nature-title mt-4 text-4xl sm:text-5xl lg:text-6xl">Memos</h1>
        <p className="nature-muted mx-auto mt-4 max-w-2xl text-base sm:text-lg">
          {isMemoListWebDemo
            ? "本地模拟数据从中间位置开始，向上或向下滚动以测试连续加载与卡片定位。"
            : "记录想法、灵感和日常思考的快速笔记"}
        </p>
      </div>

      {isConsoleRuntime && initialIsAdmin ? (
        <PublicMemoComposerIsland
          initialIsAdmin={initialIsAdmin}
          initialMemos={initialAuthorMemos}
          initialHasMore={initialMemosHasMore}
          initialNextCursor={initialMemosNextCursor}
          initialHasNewer={initialMemosHasNewer}
          initialPreviousCursor={initialMemosPreviousCursor}
          localSourceEnabled={localSourceEnabled}
          localMemoRootPath={localMemoRootPath}
        />
      ) : null}

      {!isConsoleRuntime || !initialIsAdmin ? (
        <MemoTimeline
          source={isMemoListWebDemo ? "demo" : isConsoleRuntime ? "database" : "snapshot"}
          initialMemos={renderedMemos}
          initialHasMore={renderedMemosHasMore}
          initialNextCursor={renderedMemosNextCursor}
          initialHasNewer={isConsoleRuntime || isMemoListWebDemo ? initialMemosHasNewer : false}
          initialPreviousCursor={
            isConsoleRuntime || isMemoListWebDemo ? initialMemosPreviousCursor : null
          }
          initialError={initialMemosError}
          snapshotVersion={isConsoleRuntime ? undefined : snapshot?.generatedAt}
          iconMap={snapshot?.tags.tagIconMap ?? {}}
          iconSvgMap={snapshot?.tags.tagIconSvgMap ?? {}}
        />
      ) : null}
    </section>
  );
}
