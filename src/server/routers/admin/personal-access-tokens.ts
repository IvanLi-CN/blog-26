import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
  type PersonalAccessTokenWithUser,
  revokePersonalAccessTokenById,
} from "@/server/services/personal-access-tokens";
import { adminProcedure, createTRPCRouter } from "../../trpc";

const listTokensInput = z
  .object({
    includeRevoked: z.boolean().optional(),
  })
  .optional();

const createTokenInput = z.object({
  label: z.string().trim().min(1).max(120).optional(),
});

const revokeTokenInput = z.object({
  tokenId: z.string().uuid(),
});

function sanitizeTokenPayload(tokenWithUser: PersonalAccessTokenWithUser) {
  const { token, user } = tokenWithUser;
  const { tokenHash: _tokenHash, ...tokenSafe } = token;
  return {
    token: tokenSafe,
    user,
  };
}

export const adminPersonalAccessTokensRouter = createTRPCRouter({
  list: adminProcedure.input(listTokensInput).query(async ({ ctx, input }) => {
    const tokens = await listPersonalAccessTokens({
      userId: ctx.user.id,
      includeRevoked: input?.includeRevoked,
    });

    return tokens.map(sanitizeTokenPayload);
  }),

  create: adminProcedure.input(createTokenInput).mutation(async ({ input, ctx }) => {
    try {
      const result = await createPersonalAccessToken({
        userId: ctx.user.id,
        label: input.label,
      });

      const { tokenHash: _tokenHash, ...safeRecord } = result.record;

      return {
        token: result.token,
        record: safeRecord,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("Target user")) {
        throw new TRPCError({ code: "NOT_FOUND", message: "管理员账号不存在" });
      }

      console.error("Failed to create PAT", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "创建访问令牌失败",
      });
    }
  }),

  revoke: adminProcedure.input(revokeTokenInput).mutation(async ({ input }) => {
    const success = await revokePersonalAccessTokenById(input.tokenId);
    if (!success) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "令牌不存在或已被撤销",
      });
    }

    return { success: true };
  }),
});
