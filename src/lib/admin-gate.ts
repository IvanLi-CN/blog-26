import { headers } from "next/headers";
import { forbidden, unauthorized } from "next/navigation";
import { getAdminEmail, getSsoEmailHeaderName } from "./admin-config";

/**
 * 统一的后台访问控制：
 * - 仅依赖 SSO/网关注入的邮箱请求头判断是否为管理员
 * - 非管理员时，根据是否存在邮箱头区分 401（未登录）与 403（权限不足）
 * - 使用 Next.js 官方 unauthorized/forbidden 中断渲染，返回正确的 HTTP 状态码
 */
export async function ensureAdminOrInterrupt() {
  const headersList = await headers();
  const adminEmail = getAdminEmail();
  const emailHeaderName = getSsoEmailHeaderName();
  const remoteEmail = headersList.get(emailHeaderName);
  const isAdmin = Boolean(remoteEmail && remoteEmail === adminEmail);

  if (isAdmin) return;

  if (remoteEmail) {
    // 已登录但不是管理员
    forbidden();
  } else {
    // 未登录（缺少 SSO 邮箱头）
    unauthorized();
  }
}
