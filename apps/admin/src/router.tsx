import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { AppShell } from "~/components/app-shell";
import { CommentsPage } from "~/pages/comments";
import { ContentSyncPage } from "~/pages/content-sync";
import { DashboardPage } from "~/pages/dashboard";
import { EditorPage } from "~/pages/editor";
import { LlmSettingsPage } from "~/pages/llm-settings";
import { PatsPage } from "~/pages/pats";
import { PostsPage } from "~/pages/posts";
import { MemoPreviewPage, PostPreviewPage } from "~/pages/preview";
import { ScheduleDetailPage } from "~/pages/schedule-detail";
import { ScheduleRunDetailPage } from "~/pages/schedule-run-detail";
import { SchedulesPage } from "~/pages/schedules";
import { TagIconsPage } from "~/pages/tag-icons";
import { TagsPage } from "~/pages/tags";

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: () => (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <h1 className="text-3xl font-semibold">页面不存在</h1>
      <p className="mt-3 text-sm text-muted-foreground">这个后台路由没有匹配到内容。</p>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "dashboard",
  component: DashboardPage,
});
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "posts",
  component: PostsPage,
});
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "posts/editor",
  component: EditorPage,
});
const commentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "comments",
  component: CommentsPage,
});
const contentSyncRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "content-sync",
  component: ContentSyncPage,
});
const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "schedules",
  component: SchedulesPage,
});
const scheduleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "schedules/$key",
  component: ScheduleDetailPage,
});
const scheduleRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "schedules/runs/$id",
  component: ScheduleRunDetailPage,
});
const tagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tags",
  component: TagsPage,
});
const tagIconsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tag-icons",
  component: TagIconsPage,
});
const patsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "pats",
  component: PatsPage,
});
const llmSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "llm-settings",
  component: LlmSettingsPage,
});
const postPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "preview/posts/$slug",
  component: PostPreviewPage,
});
const memoPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "preview/memos/$slug",
  component: MemoPreviewPage,
});

const dataSyncAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "data-sync",
  beforeLoad: () => {
    throw redirect({ to: "/content-sync" });
  },
});

const cacheAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "cache",
  beforeLoad: () => {
    throw redirect({ to: "/content-sync" });
  },
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  postsRoute,
  editorRoute,
  commentsRoute,
  contentSyncRoute,
  schedulesRoute,
  scheduleDetailRoute,
  scheduleRunRoute,
  tagsRoute,
  tagIconsRoute,
  patsRoute,
  llmSettingsRoute,
  postPreviewRoute,
  memoPreviewRoute,
  dataSyncAliasRoute,
  cacheAliasRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: "/admin",
  defaultPreload: "intent",
  scrollRestoration: true,
  notFoundMode: "root",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
