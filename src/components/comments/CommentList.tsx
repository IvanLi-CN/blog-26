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
        <div className="text-4xl mb-2">💬</div>
        <p>暂无评论，成为第一个评论者吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
