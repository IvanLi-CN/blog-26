import { createTRPCRouter } from "../../trpc";
import { adminCommentsRouter } from "./comments";
import { adminContentSyncRouter } from "./content-sync";
import { adminDashboardRouter } from "./dashboard";
import { adminPostsRouter } from "./posts";

/**
 * 管理员路由
 * 整合所有管理员功能的子路由
 */
export const adminRouter = createTRPCRouter({
  dashboard: adminDashboardRouter,
  posts: adminPostsRouter,
  comments: adminCommentsRouter,
  contentSync: adminContentSyncRouter,
});
