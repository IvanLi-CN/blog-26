import { useCallback, useEffect, useState } from "react";
import { toPublicApiUrl } from "@/lib/public-runtime-url";
import type { Comment, UserInfo } from "./types";

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

type CommentWithAuthorAndReplies = Comment;

export function useUserInfo() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await readJson<UserInfo | null>(toPublicApiUrl("/api/public/auth/me"));
      setUserInfo(data);
    } catch {
      setUserInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUserInfo();
  }, [fetchUserInfo]);

  const logout = useCallback(async () => {
    try {
      await readJson(toPublicApiUrl("/api/public/auth/logout"), { method: "POST" });
    } finally {
      setUserInfo(null);
      window.location.reload();
    }
  }, []);

  return { userInfo, logout, isLoading, refetchUserInfo: fetchUserInfo };
}

interface UseCommentsProps {
  postSlug: string;
}

export function useComments({ postSlug }: UseCommentsProps) {
  const [comments, setComments] = useState<CommentWithAuthorAndReplies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchComments = useCallback(
    async (pageNum: number, refresh = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await readJson<{
          comments: CommentWithAuthorAndReplies[];
          totalPages: number;
          isAdmin: boolean;
        }>(
          toPublicApiUrl(
            `/api/public/comments?slug=${encodeURIComponent(postSlug)}&page=${pageNum}&limit=10`
          )
        );
        setComments((prev) =>
          pageNum === 1 || refresh ? data.comments : [...prev, ...data.comments]
        );
        setTotalPages(data.totalPages);
        setIsAdmin(data.isAdmin || false);
        setPage(pageNum);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [postSlug]
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
    void fetchComments(1);
  }, [fetchComments]);

  return { comments, isLoading, error, totalPages, page, loadMore, refetch, isAdmin };
}

export function useModerateComment() {
  const [isModerating, setIsModerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moderateComment = useCallback(
    async (commentId: string, status: "approved" | "rejected") => {
      setIsModerating(true);
      setError(null);
      try {
        const result = await readJson(
          toPublicApiUrl(`/api/public/comments/${encodeURIComponent(commentId)}/moderate`),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status }),
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

export function usePostComment() {
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postComment = useCallback(
    async (commentData: {
      postSlug: string;
      content: string;
      parentId?: string;
      author?: Omit<UserInfo, "id" | "avatarUrl">;
      captchaResponse?: string;
    }) => {
      setIsPosting(true);
      setError(null);
      try {
        const result = await readJson(toPublicApiUrl("/api/public/comments"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commentData),
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

  const editComment = useCallback(async (commentId: string, content: string) => {
    setIsEditing(true);
    setError(null);
    try {
      return await readJson(
        toPublicApiUrl(`/api/public/comments/${encodeURIComponent(commentId)}`),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsEditing(false);
    }
  }, []);

  return { editComment, isEditing, error };
}

export function useDeleteComment() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteComment = useCallback(async (commentId: string) => {
    setIsDeleting(true);
    setError(null);
    try {
      return await readJson(
        toPublicApiUrl(`/api/public/comments/${encodeURIComponent(commentId)}`),
        {
          method: "DELETE",
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
