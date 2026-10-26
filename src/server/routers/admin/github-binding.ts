import {
  getAdminGithubBindingStatus,
  unbindAdminGithubBinding,
} from "../../../lib/admin-github-binding";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const adminGithubBindingRouter = createTRPCRouter({
  get: adminProcedure.query(async ({ ctx }) => {
    return getAdminGithubBindingStatus(ctx.user.id);
  }),

  unbind: adminProcedure.mutation(async ({ ctx }) => {
    const binding = await unbindAdminGithubBinding(ctx.user.id);
    return {
      success: true,
      message: binding ? "GitHub 管理员身份已解绑" : "当前没有已绑定的 GitHub 身份",
    };
  }),
});
