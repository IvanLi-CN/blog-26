"use client";

import { trpc } from "../lib/trpc";

export interface AuthUser {
  id: string;
  nickname: string;
  email: string;
  avatarUrl: string;
  isAdmin: boolean;
}

export interface UseAuthResult {
  /** 当前用户信息，未登录时为 null */
  user: AuthUser | null;
  /** 是否为管理员 */
  isAdmin: boolean;
  /** 是否正在加载用户信息 */
  isLoading: boolean;
  /** 加载错误信息 */
  error: Error | null;
  /** 重新获取用户信息 */
  refetch: () => void;
}

/**
 * 用户认证和权限管理 Hook
 *
 * 提供统一的用户认证状态和权限检查功能
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAdmin, isLoading } = useAuth();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       {user ? `Hello, ${user.nickname}` : 'Not logged in'}
 *       {isAdmin && <AdminPanel />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(): UseAuthResult {
  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    // 启用重试，确保网络问题时能够恢复
    retry: 3,
    // 设置缓存时间，避免频繁请求
    staleTime: 5 * 60 * 1000, // 5分钟
    // 在窗口重新获得焦点时重新获取
    refetchOnWindowFocus: true,
  });

  return {
    user: user || null,
    isAdmin: user?.isAdmin || false,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * 权限检查 Hook
 *
 * 用于需要特定权限才能访问的组件
 *
 * @param requiredPermission - 需要的权限类型
 * @returns 是否有权限访问
 *
 * @example
 * ```tsx
 * function AdminOnlyComponent() {
 *   const hasPermission = usePermission('admin');
 *
 *   if (!hasPermission) {
 *     return <div>Access denied</div>;
 *   }
 *
 *   return <AdminPanel />;
 * }
 * ```
 */
export function usePermission(requiredPermission: "admin" | "user"): boolean {
  const { user, isAdmin, isLoading } = useAuth();

  // 加载中时返回 false，避免权限检查期间显示受保护内容
  if (isLoading) {
    return false;
  }

  switch (requiredPermission) {
    case "admin":
      return isAdmin;
    case "user":
      return !!user;
    default:
      return false;
  }
}
