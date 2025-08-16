import CommentItem from "./CommentItem";
import type { Comment, UserInfo } from "./types";

interface CommentListProps {
  comments: Comment[];
  postSlug: string;
  onCommentPosted: (message?: string) => void;
  userInfo: UserInfo | null;
  postComment: (commentData: {
    postSlug: string;
    content: string;
    parentId?: string;
    author?: Omit<UserInfo, "id" | "avatarUrl">;
  }) => Promise<any>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
  onLoginSuccess: () => Promise<void>;
  isAdmin: boolean;
}

export default function CommentList({
  comments,
  postSlug,
  onCommentPosted,
  userInfo,
  postComment,
  isPosting,
  error,
  onLogout,
  onLoginSuccess,
  isAdmin,
}: CommentListProps) {
  if (comments.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/50">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-base-content mb-2">暂无评论</h3>
        <p className="text-base-content/60">成为第一个评论者，分享你的想法吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postSlug={postSlug}
          onCommentPosted={onCommentPosted}
          userInfo={userInfo}
          postComment={postComment}
          isPosting={isPosting}
          error={error}
          onLogout={onLogout}
          onLoginSuccess={onLoginSuccess}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
}
