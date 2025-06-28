import { useCallback, useEffect, useState } from 'react';
import { type Comment, type UserInfo } from './types';

// --- User Info Hook ---
export function useUserInfo() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUserInfo(data);
      } else {
        setUserInfo(null);
      }
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
      // This will request the server to clear the HttpOnly cookie
      await fetch('/api/auth/logout', { method: 'POST' });
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
  const [comments, setComments] = useState<Comment[]>([]);
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
        const response = await fetch(`/api/comments?slug=${postSlug}&page=${pageNum}`);
        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }
        const data = await response.json();
        setComments((prev) => (pageNum === 1 || refresh ? data.comments : [...prev, ...data.comments]));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postSlug]);

  return { comments, isLoading, error, totalPages, page, loadMore, refetch, isAdmin };
}

export function useModerateComment() {
  const [isModerating, setIsModerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moderateComment = useCallback(async (commentId: string, status: 'approved' | 'rejected') => {
    setIsModerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'An unknown error occurred' }));
        throw new Error(result.error || 'Failed to moderate message');
      }
      return await response.json();
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsModerating(false);
    }
  }, []);

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
      author?: Omit<UserInfo, 'id' | 'avatarUrl'>;
    }) => {
      setIsPosting(true);
      setError(null);
      try {
        const response = await fetch('/api/comments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(commentData),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => ({ error: 'An unknown error occurred' }));
          setError(result.error || 'Failed to post message');
          // Return the raw response so the caller can check the status code
          return response;
        }

        return response.json();
      } catch (err: any) {
        setError(err.message);
        // We throw here to let the caller know the request failed at a network level
        throw err;
      } finally {
        setIsPosting(false);
      }
    },
    []
  );

  return { postComment, isPosting, error };
}
