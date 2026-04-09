"use client";

import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  nickname: string;
  email: string;
  avatarUrl: string;
  isAdmin: boolean;
}

export interface UseAuthResult {
  user: AuthUser | null;
  isAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

async function readUser() {
  const response = await fetch("/api/public/auth/me", {
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Failed to fetch auth state (${response.status})`;
    throw new Error(message);
  }
  return (payload ?? null) as AuthUser | null;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(() => {
    setIsLoading(true);
    setError(null);
    void readUser()
      .then((nextUser) => {
        setUser(nextUser);
      })
      .catch((err: unknown) => {
        setUser(null);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    user,
    isAdmin: user?.isAdmin || false,
    isLoading,
    error,
    refetch,
  };
}

export function usePermission(requiredPermission: "admin" | "user"): boolean {
  const { user, isAdmin, isLoading } = useAuth();

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
