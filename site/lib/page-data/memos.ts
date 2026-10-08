import type { z } from "zod";
import { isLocalContentEnabled } from "@/config/paths";
import { getServerLocalMemoRootPath } from "@/lib/memo-paths";
import { resolveRuntimeContext } from "@/lib/runtime-context";
import { getWebDemoSceneState } from "@/lib/web-demo-runtime";
import type { MemoCardRecord } from "../../components/MemoCard";
import { getMemoListWebDemoInitialPageForState } from "../memo-list-web-demo";
import {
  adminMemoRecordSchema,
  parseMemoPage,
  publicMemoCardSchema,
  toMemoCardRecord,
} from "../memo-pagination";
import { getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { trimRouteSnapshot } from "../route-data-utils";
export async function loadmemos(Astro: PageContext) {
  const isMemoListWebDemo = process.env.WEB_DEMO_BUILD === "true";
  const webDemoSceneState = isMemoListWebDemo
    ? getWebDemoSceneState(Astro.url, "public")
    : undefined;
  const snapshot = isMemoListWebDemo ? null : await getSnapshot();
  const isConsoleBuild = !isMemoListWebDemo && process.env.CONSOLE_RUNTIME === "true";
  const runtimeContext = isConsoleBuild
    ? resolveRuntimeContext(Astro.request)
    : { mode: "public" as const };
  const isConsoleRuntime = isConsoleBuild && runtimeContext.mode === "console";
  let initialIsAdmin = false;
  let initialMemos: MemoCardRecord[] = snapshot?.memos.slice(0, 10) ?? [];
  let initialAuthorMemos: z.infer<typeof adminMemoRecordSchema>[] = [];
  let initialMemosHasMore = false;
  let initialMemosNextCursor: string | null = null;
  let initialMemosHasNewer = false;
  let initialMemosPreviousCursor: string | null = null;
  let initialMemosError: string | null = null;
  if (isMemoListWebDemo) {
    const demoPage = getMemoListWebDemoInitialPageForState(
      webDemoSceneState ?? { scene: "memo-middle", data: "fixture" }
    );
    initialMemos = demoPage.memos;
    initialMemosHasMore = demoPage.hasMore;
    initialMemosNextCursor = demoPage.nextCursor;
    initialMemosHasNewer = demoPage.hasPrevious;
    initialMemosPreviousCursor = demoPage.previousCursor;
  } else if (isConsoleRuntime) {
    const { extractAuthFromRequest } = await import("@/lib/auth-utils");
    const { handlePublicApiRequest } = await import("@/server/public-api/router");
    const auth = await extractAuthFromRequest(Astro.request);
    initialIsAdmin = auth.isAdmin;
    const memoRequest = new Request(
      new URL("/api/public/memos?publicOnly=false&limit=10", Astro.request.url),
      {
        headers: Astro.request.headers,
      }
    );
    const memoResponse = await handlePublicApiRequest(memoRequest, "/memos");
    try {
      if (!memoResponse.ok) throw new Error("Memo request failed");
      const value: unknown = await memoResponse.json();
      const page = initialIsAdmin
        ? parseMemoPage(value, "older", adminMemoRecordSchema)
        : parseMemoPage(value, "older", publicMemoCardSchema);
      if (initialIsAdmin)
        initialAuthorMemos = parseMemoPage(value, "older", adminMemoRecordSchema).memos;
      else initialMemos = parseMemoPage(value, "older", publicMemoCardSchema).memos;
      initialMemosHasMore = page.hasMore;
      initialMemosNextCursor = page.nextCursor;
      initialMemosHasNewer = page.hasPrevious;
      initialMemosPreviousCursor = page.previousCursor;
    } catch {
      initialMemos = [];
      initialMemosError = "公开 Memo 数据暂时不可用。";
    }
  }
  const localSourceEnabled = !isMemoListWebDemo && isLocalContentEnabled();
  const localMemoRootPath = localSourceEnabled ? getServerLocalMemoRootPath() : undefined;
  const renderedMemos =
    isConsoleRuntime || isMemoListWebDemo
      ? initialMemos
      : (snapshot?.memos.slice(0, 10) ?? initialMemos);
  const renderedMemosHasMore =
    isConsoleRuntime || isMemoListWebDemo
      ? initialMemosHasMore
      : (snapshot?.memos.length ?? renderedMemos.length) > renderedMemos.length;
  const renderedMemosNextCursor =
    isConsoleRuntime || isMemoListWebDemo
      ? initialMemosNextCursor
      : renderedMemosHasMore
        ? "2"
        : null;
  return {
    isMemoListWebDemo,
    webDemoSceneState,
    snapshot: trimRouteSnapshot(snapshot, "memos", Astro.url.pathname),
    isConsoleBuild,
    runtimeContext,
    isConsoleRuntime,
    initialIsAdmin,
    initialMemos: initialMemos.map(toMemoCardRecord),
    initialAuthorMemos,
    initialMemosHasMore,
    initialMemosNextCursor,
    initialMemosHasNewer,
    initialMemosPreviousCursor,
    initialMemosError,
    localSourceEnabled,
    localMemoRootPath,
    renderedMemos: renderedMemos.map(toMemoCardRecord),
    renderedMemosHasMore,
    renderedMemosNextCursor,
  };
}
