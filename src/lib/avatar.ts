import { createHash } from "node:crypto";

/**
 * 生成头像 URL
 * 使用 Gravatar 服务
 */
export function getAvatarUrl(email: string, size: number = 80): string {
  const hash = createHash("md5").update(email.toLowerCase().trim()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}
