import { useCallback, useEffect, useState } from 'react';
import { type Comment, type UserInfo } from './types';

// --- User Info Hook ---
export function useUserInfo() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserInfo = async () => {
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
    };

    fetchUserInfo();
  }, []);

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

  return { userInfo, logout, isLoading };
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

  const fetchComments = useCallback(
    async (pageNum: number, refresh = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/comments?slug=${postSlug}&page=${pageNum}`);
        if (!response.ok) {
          throw new Error('Failed to fetch comments');
        }
        const data = await response.json();
        setComments((prev) => (pageNum === 1 || refresh ? data.comments : [...prev, ...data.comments]));
        setTotalPages(data.totalPages);
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

  return { comments, isLoading, error, totalPages, page, loadMore, refetch };
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

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to post comment');
        }

        return result;
      } catch (err: any) {
        setError(err.message);
        // Do not re-throw the error, as it will prevent the form's state from updating.
        // The error is handled by setting the state, which is then displayed in the UI.
      } finally {
        setIsPosting(false);
      }
    },
    []
  );

  return { postComment, isPosting, error };
}
