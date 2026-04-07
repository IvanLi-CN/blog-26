import { headers } from "next/headers";
import { forbidden, unauthorized } from "next/navigation";
import { getAuthFromHeaders } from "./auth";

/**
 * 统一的后台访问控制：
 * - 生产环境仍然只依赖 SSO/网关或 PAT 的管理员判定
 * - 开发/测试环境允许复用 dev login session 的管理员识别
 * - 非管理员时，根据是否存在已识别用户区分 401（未登录）与 403（权限不足）
 * - 使用 Next.js 官方 unauthorized/forbidden 中断渲染，返回正确的 HTTP 状态码
 */
export async function ensureAdminOrInterrupt() {
  const headersList = await headers();
  const auth = await getAuthFromHeaders(headersList);

  if (auth.isAdmin) return;

  if (auth.user) {
    forbidden();
  } else {
    unauthorized();
  }
}
