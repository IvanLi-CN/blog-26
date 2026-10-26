import Icon from "../ui/Icon";
import CommentItem from "./CommentItem";
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Comment, UserInfo } from "./types";

interface CommentListProps {
  comments: Comment[];
  density?: "root" | "reply";
  postSlug: string;
  target?: { type: "article" | "memo" | "project"; key: string };
  onCommentPosted: (message?: string) => void;
  userInfo: UserInfo | null;
  postComment: (commentData: {
    postSlug: string;
    content: string;
    parentId?: string;
    target?: { type: "article" | "memo" | "project"; key: string };
    submissionKey?: string;
  }) => Promise<any>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
  onLoginSuccess: () => Promise<void>;
  isAdmin: boolean;
  usePublicSitePaths?: boolean;
}

export default function CommentList({
  comments,
  density = "root",
  postSlug,
  target,
  onCommentPosted,
  userInfo,
  postComment,
  isPosting,
  error,
  onLogout,
  onLoginSuccess,
  isAdmin,
  usePublicSitePaths = false,
}: CommentListProps) {
  if (comments.length === 0) {
    return (
      <div className="comment-empty py-12" data-testid="comments-empty">
        <div className="comment-empty__icon">
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
    <div className={`comment-list ${density === "reply" ? "comment-list--replies" : ""}`}>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          density={density}
          postSlug={postSlug}
          target={target}
          onCommentPosted={onCommentPosted}
          userInfo={userInfo}
          postComment={postComment}
          isPosting={isPosting}
          error={error}
          onLogout={onLogout}
          onLoginSuccess={onLoginSuccess}
          isAdmin={isAdmin}
          usePublicSitePaths={usePublicSitePaths}
        />
      ))}
    </div>
  );
}
