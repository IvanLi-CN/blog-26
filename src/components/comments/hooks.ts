import { useCallback, useEffect, useState } from "react";
import { trpcVanilla } from "../../lib/trpc";
import type { UserInfo } from "./types";

// 使用 tRPC 推导的类型
type CommentWithAuthorAndReplies = Awaited<
  ReturnType<typeof trpcVanilla.comments.getComments.query>
>["comments"][0];

// --- User Info Hook ---
export function useUserInfo() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await trpcVanilla.auth.me.query();
      setUserInfo(data);
    } catch {
      setUserInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserInfo();
  }, [fetchUserInfo]);

  const logout = useCallback(async () => {
    try {
      // Use tRPC for logout
      await trpcVanilla.auth.logout.mutate();
    } finally {
      // Regardless of server outcome, update UI state
      setUserInfo(null);
      // Force a reload to ensure server-side state is reflected
      window.location.reload();
    }
  }, []);

  return { userInfo, logout, isLoading, refetchUserInfo: fetchUserInfo };
}

// --- API Hooks ---
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
        const data = await trpcVanilla.comments.getComments.query({
          slug: postSlug,
          page: pageNum,
          limit: 10,
        });
        setComments((prev) =>
          pageNum === 1 || refresh ? data.comments : [...prev, ...data.comments]
        );
        setTotalPages(data.totalPages);
        setIsAdmin(data.isAdmin || false);
        setPage(pageNum); // Update page state
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [postSlug]
  );

  const loadMore = () => {
    if (page < totalPages && !isLoading) {
      const nextPage = page + 1;
      fetchComments(nextPage);
    }
  };

  const refetch = () => {
    fetchComments(1, true);
  };

  useEffect(() => {
    fetchComments(1);
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
        const result = await trpcVanilla.comments.moderateComment.mutate({
          commentId,
          status,
        });
        return result;
      } catch (err: any) {
        setError(err.message);
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
    }) => {
      setIsPosting(true);
      setError(null);
      try {
        const result = await trpcVanilla.comments.createComment.mutate({
          postSlug: commentData.postSlug,
          content: commentData.content,
          parentId: commentData.parentId,
          author: commentData.author,
        });

        return { ok: true, json: () => Promise.resolve(result) };
      } catch (err: any) {
        setError(err.message || "Failed to post message");
        return { ok: false, json: () => Promise.resolve({ error: err.message }) };
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
      const result = await trpcVanilla.comments.editComment.mutate({
        commentId,
        content,
      });
      return result;
    } catch (err: any) {
      setError(err.message);
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
      const result = await trpcVanilla.comments.deleteComment.mutate({
        commentId,
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return { deleteComment, isDeleting, error };
}
