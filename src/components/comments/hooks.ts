import { useCallback, useEffect, useRef, useState } from "react";
import { toPublicApiUrl } from "@/lib/public-runtime-url";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import { subscribeWebDemoRequestChanges } from "@/lib/web-demo-runtime";
import type { Comment, UserInfo } from "./types";

export type CommentViewState = "loading" | "ready-empty" | "ready" | "target-unavailable" | "error";

export class CommentRequestError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "CommentRequestError";
    this.status = options.status;
    this.code = options.code;
  }
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await webDemoFetch(input, {
    credentials: "include",
    ...init,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record =
      payload && typeof payload === "object"
        ? (payload as { error?: unknown; code?: unknown })
        : null;
    const message =
      typeof record?.error === "string"
        ? record.error
        : `Request failed with status ${response.status}`;
    throw new CommentRequestError(message, {
      status: response.status,
      code: typeof record?.code === "string" ? record.code : `HTTP_${response.status}`,
    });
  }
  return payload as T;
}

type CommentWithAuthorAndReplies = Comment;

export function useUserInfo() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestVersion = useRef(0);

  const fetchUserInfo = useCallback(async () => {
    const version = ++requestVersion.current;
    setIsLoading(true);
    try {
      const data = await readJson<{
        reader: {
          id: string;
          githubLogin: string;
          displayName: string | null;
          avatarUrl: string | null;
          profileUrl: string | null;
        } | null;
      }>(toPublicApiUrl("/api/public/reader-auth/me"));
      if (version !== requestVersion.current) return;
      setUserInfo(
        data.reader
          ? {
              id: data.reader.id,
              nickname: data.reader.displayName || data.reader.githubLogin,
              email: null,
              avatarUrl: data.reader.avatarUrl || "/site-assets/default-avatar.svg",
              profileUrl: data.reader.profileUrl,
            }
          : null
      );
    } catch {
      if (version !== requestVersion.current) return;
      // A transient connection failure must not discard the last known reader.
      // Successful responses still clear the identity when the session is gone.
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUserInfo();
    const unsubscribe = subscribeWebDemoRequestChanges((detail) => {
      if (detail?.changed.includes("persona")) setUserInfo(null);
      void fetchUserInfo();
    });
    return () => {
      requestVersion.current += 1;
      unsubscribe();
    };
  }, [fetchUserInfo]);

  const logout = useCallback(async () => {
    try {
      await readJson(toPublicApiUrl("/api/public/reader-auth/logout"), { method: "POST" });
    } finally {
      setUserInfo(null);
      window.location.reload();
    }
  }, []);

  return { userInfo, logout, isLoading, refetchUserInfo: fetchUserInfo };
}

interface UseCommentsProps {
  postSlug: string;
  target?: { type: "article" | "memo" | "project"; key: string };
}

export function useComments({ postSlug, target }: UseCommentsProps) {
  const [comments, setComments] = useState<CommentWithAuthorAndReplies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<CommentRequestError | null>(null);
  const [viewState, setViewState] = useState<CommentViewState>("loading");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const requestVersion = useRef(0);
  const hasSuccessfulLoad = useRef(false);
  const targetType = target?.type;
  const targetKey = target?.key;

  const fetchComments = useCallback(
    async (pageNum: number, refresh = false, preserveContext = true) => {
      const version = ++requestVersion.current;
      if (!preserveContext) {
        hasSuccessfulLoad.current = false;
        setComments([]);
        setPage(1);
        setTotalPages(1);
        setIsAdmin(false);
        setViewState("loading");
      }
      setIsLoading(true);
      setError(null);
      if (!preserveContext || !hasSuccessfulLoad.current) setViewState("loading");
      try {
        const data = await readJson<{
          comments: CommentWithAuthorAndReplies[];
          totalPages: number;
          isAdmin: boolean;
        }>(
          toPublicApiUrl(
            `/api/public/comments?slug=${encodeURIComponent(postSlug)}${
              targetType && targetKey
                ? `&targetType=${encodeURIComponent(targetType)}&targetKey=${encodeURIComponent(targetKey)}`
                : ""
            }&page=${pageNum}&limit=10`
          )
        );
        if (version !== requestVersion.current) return;
        const nextComments = Array.isArray(data.comments) ? data.comments : [];
        setComments((prev) =>
          pageNum === 1 || refresh ? nextComments : [...prev, ...nextComments]
        );
        setTotalPages(
          typeof data.totalPages === "number" && Number.isFinite(data.totalPages)
            ? Math.max(1, data.totalPages)
            : 1
        );
        setIsAdmin(data.isAdmin || false);
        setPage(pageNum);
        hasSuccessfulLoad.current = true;
        if (pageNum === 1 || refresh) {
          setViewState(nextComments.length > 0 ? "ready" : "ready-empty");
        } else {
          setViewState("ready");
        }
      } catch (err: unknown) {
        if (version !== requestVersion.current) return;
        const requestError =
          err instanceof CommentRequestError
            ? err
            : new CommentRequestError(err instanceof Error ? err.message : String(err), {
                code: "NETWORK_ERROR",
              });
        setError(requestError);
        const targetUnavailable = Boolean(
          targetType &&
            targetKey &&
            requestError.status === 404 &&
            requestError.code === "NOT_FOUND"
        );
        if (targetUnavailable) {
          hasSuccessfulLoad.current = false;
          setComments([]);
          setPage(1);
          setTotalPages(1);
          setIsAdmin(false);
          setViewState("target-unavailable");
        } else if (!hasSuccessfulLoad.current) {
          setViewState("error");
        }
      } finally {
        if (version === requestVersion.current) setIsLoading(false);
      }
    },
    [postSlug, targetKey, targetType]
  );

  const loadMore = () => {
    if (page < totalPages && !isLoading) {
      void fetchComments(page + 1);
    }
  };

  const refetch = () => {
    void fetchComments(1, true);
  };

  useEffect(() => {
    hasSuccessfulLoad.current = false;
    setComments([]);
    setPage(1);
    setTotalPages(1);
    setViewState("loading");
    void fetchComments(1);
    const unsubscribe = subscribeWebDemoRequestChanges((detail) => {
      const preserveContext = Boolean(
        detail?.changed.length &&
          detail.changed.every((key) => key === "connection" || key === "delay")
      );
      void fetchComments(1, true, preserveContext);
    });
    return () => {
      requestVersion.current += 1;
      unsubscribe();
    };
  }, [fetchComments]);

  return {
    comments,
    isLoading,
    error,
    viewState,
    totalPages,
    page,
    loadMore,
    refetch,
    isAdmin,
  };
}

export function useModerateComment() {
  const [isModerating, setIsModerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moderateComment = useCallback(
    async (commentId: string, status: "approved" | "rejected", expectedRevision?: number) => {
      setIsModerating(true);
      setError(null);
      try {
        const result = await readJson(
          toPublicApiUrl(`/api/public/comments/${encodeURIComponent(commentId)}/moderate`),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status, expectedRevision }),
          }
        );
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setIsModerating(false);
      }
    },
    []
  );

  return { moderateComment, isModerating, error };
}

export function useCommentReplies() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReplies = useCallback(async (commentId: string, cursor?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      return await readJson<{ replies: Comment[]; nextCursor: string | null }>(
        toPublicApiUrl(
          `/api/public/comments/${encodeURIComponent(commentId)}/replies?limit=20${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
          }`
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { loadReplies, isLoading, error };
}

export function useRestoreComment() {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restoreComment = useCallback(async (commentId: string, expectedRevision?: number) => {
    setIsRestoring(true);
    setError(null);
    try {
      return await readJson(
        toPublicApiUrl(`/api/public/comments/${encodeURIComponent(commentId)}/restore`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedRevision }),
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  return { restoreComment, isRestoring, error };
}

export function usePostComment() {
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postComment = useCallback(
    async (commentData: {
      postSlug: string;
      content: string;
      parentId?: string;
      target?: { type: "article" | "memo" | "project"; key: string };
      submissionKey?: string;
    }) => {
      setIsPosting(true);
      setError(null);
      try {
        const result = await readJson(toPublicApiUrl("/api/public/comments"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...commentData,
            submissionKey: commentData.submissionKey || crypto.randomUUID(),
          }),
        });

        return { ok: true, json: () => Promise.resolve(result) };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to post message";
        setError(message);
        return { ok: false, json: () => Promise.resolve({ error: message }) };
      } finally {
        setIsPosting(false);
      }
    },
    []
  );

  return { postComment, isPosting, error };
}

export function useEditComment() {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editComment = useCallback(
    async (commentId: string, content: string, expectedRevision?: number) => {
      setIsEditing(true);
      setError(null);
      try {
        return await readJson(
          toPublicApiUrl(`/api/public/comments/${encodeURIComponent(commentId)}`),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content, expectedRevision }),
          }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setIsEditing(false);
      }
    },
    []
  );

  return { editComment, isEditing, error };
}

export function useDeleteComment() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteComment = useCallback(async (commentId: string, expectedRevision?: number) => {
    setIsDeleting(true);
    setError(null);
    try {
      return await readJson(
        toPublicApiUrl(`/api/public/comments/${encodeURIComponent(commentId)}`),
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedRevision }),
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return { deleteComment, isDeleting, error };
}
