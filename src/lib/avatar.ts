import { createHash } from 'node:crypto';

/**
 * 根据邮箱生成 Gravatar 头像 URL。
 * @param email 用户的邮箱地址。
 * @returns Gravatar 头像的 URL。
 */
export function getAvatarUrl(email: string): string {
  const hash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  // d=retro 参数为没有 Gravatar 账户的用户生成一个独特的复古像素风头像
  return `https://www.gravatar.com/avatar/${hash}?d=retro`;
}
