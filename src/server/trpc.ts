import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context';

// 初始化 tRPC
export const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof z.ZodError ? error.cause.flatten() : null,
        httpStatus: getHTTPStatusCodeFromError(error),
      },
    };
  },
});

// 获取 HTTP 状态码
function getHTTPStatusCodeFromError(err: TRPCError): number {
  const code = err.code;
  switch (code) {
    case 'BAD_REQUEST':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'METHOD_NOT_SUPPORTED':
      return 405;
    case 'TIMEOUT':
      return 408;
    case 'CONFLICT':
      return 409;
    case 'PRECONDITION_FAILED':
      return 412;
    case 'PAYLOAD_TOO_LARGE':
      return 413;
    case 'UNPROCESSABLE_CONTENT':
      return 422;
    case 'TOO_MANY_REQUESTS':
      return 429;
    case 'CLIENT_CLOSED_REQUEST':
      return 499;
    case 'INTERNAL_SERVER_ERROR':
      return 500;
    default:
      return 500;
  }
}

// 导出路由器和过程创建器
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// 认证中间件
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      // infers the `user` as non-nullable
      user: ctx.user,
    },
  });
});

// 管理员中间件
const enforceUserIsAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user || !ctx.isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({
    ctx: {
      user: ctx.user,
      isAdmin: ctx.isAdmin,
    },
  });
});

// 受保护的过程（需要登录）
export const protectedProcedure = publicProcedure.use(enforceUserIsAuthed);

// 管理员过程（需要管理员权限）
export const adminProcedure = publicProcedure.use(enforceUserIsAdmin);
