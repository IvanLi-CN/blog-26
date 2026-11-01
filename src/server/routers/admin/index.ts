import { createTRPCRouter } from "../../trpc";
import { adminCommentsRouter } from "./comments";
import { adminContentSyncRouter } from "./content-sync";
import { adminDashboardRouter } from "./dashboard";
import { filesRouter } from "./files";
import { adminGithubBindingRouter } from "./github-binding";
import { adminJobsRouter } from "./jobs";
import { adminPersonalAccessTokensRouter } from "./personal-access-tokens";
import { adminPlaybookRouter } from "./playbook";
import { adminPostsRouter } from "./posts";
import { adminProjectStatusRouter } from "./project-status";
import { adminVectorizeRouter } from "./vectorize";

/**
 * 管理员路由
 * 整合所有管理员功能的子路由
 */
export const adminRouter = createTRPCRouter({
  dashboard: adminDashboardRouter,
  posts: adminPostsRouter,
  playbook: adminPlaybookRouter,
  comments: adminCommentsRouter,
  githubBinding: adminGithubBindingRouter,
  contentSync: adminContentSyncRouter,
  vectorize: adminVectorizeRouter,
  jobs: adminJobsRouter,
  files: filesRouter,
  personalAccessTokens: adminPersonalAccessTokensRouter,
  projectStatus: adminProjectStatusRouter,
});
