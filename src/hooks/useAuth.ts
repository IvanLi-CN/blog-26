"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import { subscribeWebDemoRequestChanges } from "@/lib/web-demo-runtime";

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
  const response = await webDemoFetch("/api/public/auth/me", {
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
  const requestVersion = useRef(0);

  const refetch = useCallback(() => {
    const version = ++requestVersion.current;
    setIsLoading(true);
    setError(null);
    void readUser()
      .then((nextUser) => {
        if (version !== requestVersion.current) return;
        setUser(nextUser);
      })
      .catch((err: unknown) => {
        if (version !== requestVersion.current) return;
        setUser(null);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (version !== requestVersion.current) return;
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
    const unsubscribe = subscribeWebDemoRequestChanges(refetch);
    return () => {
      requestVersion.current += 1;
      unsubscribe();
    };
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
