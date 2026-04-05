import Icon from "../ui/Icon";
import CommentItem from "./CommentItem";
/* eslint-disable @typescript-eslint/no-explicit-any */

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
      <div className="nature-empty py-12">
        <div className="nature-empty-icon">
          <Icon name="tabler:message-circle-2" className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[color:var(--nature-text)]">暂无评论</h3>
          <p className="mt-2 text-[color:var(--nature-text-soft)]">
            成为第一个评论者，分享你的想法吧。
          </p>
        </div>
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
