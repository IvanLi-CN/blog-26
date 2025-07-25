import { trpc } from '~/lib/trpc-client';

interface CommentCountProps {
  slug: string;
  className?: string;
}

export function CommentCount({ slug, className = '' }: CommentCountProps) {
  const { data: commentCounts, isLoading } = trpc.comments.getCommentCounts.useQuery(
    { slugs: [slug] },
    {
      staleTime: 1000 * 60 * 5, // 5分钟缓存
      refetchOnWindowFocus: false,
    }
  );

  const count = commentCounts?.[slug] || 0;

  // 如果没有评论，不显示
  if (count === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1 text-xs text-base-content/40 ${className}`}>
        <div className="skeleton h-3 w-3 rounded-full" />
        <div className="skeleton h-3 w-4" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 text-xs text-base-content/60 hover:text-base-content/80 transition-colors ${className}`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
      <span>{count}</span>
    </div>
  );
}
