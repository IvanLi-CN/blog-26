import React, { useState } from 'react';
import CommentForm from './CommentForm';
import CommentList from './CommentList';
import type { Comment, UserInfo } from './types';

interface CommentItemProps {
  comment: Comment;
  postSlug: string;
  onCommentPosted: () => void;
  userInfo: UserInfo | null;
  postComment: (commentData: {
    postSlug: string;
    content: string;
    parentId?: string;
    author?: Omit<UserInfo, 'id'>;
  }) => Promise<any>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function CommentItem({
  comment,
  postSlug,
  onCommentPosted,
  userInfo,
  postComment,
  isPosting,
  error,
  onLogout,
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);

  const handleReplyPosted = () => {
    setIsReplying(false);
    onCommentPosted();
  };

  const handleReplyClick = () => {
    setIsReplying(!isReplying);
  };

  return (
    <div id={`comment-${comment.id}`} className="py-2">
      <div className="flex items-center">
        <span className="font-bold">{comment.author.nickname}</span>
        <time className="text-xs text-gray-500 ml-2">{formatDate(comment.createdAt)}</time>
        {comment.status === 'pending' && <span className="badge badge-warning ml-2">审核中</span>}
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none mt-1">{comment.content}</div>
      <div className="mt-1">
        <button onClick={handleReplyClick} className="text-xs btn btn-ghost btn-sm">
          回复
        </button>
      </div>

      {isReplying && (
        <div className="ml-4">
          <CommentForm
            postSlug={postSlug}
            parentId={comment.id}
            onCommentPosted={handleReplyPosted}
            userInfo={userInfo}
            postComment={postComment}
            isPosting={isPosting}
            error={error}
            onLogout={onLogout}
          />
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="pl-4 border-l-2 border-base-300">
          <CommentList
            comments={comment.replies}
            postSlug={postSlug}
            onCommentPosted={onCommentPosted}
            userInfo={userInfo}
            postComment={postComment}
            isPosting={isPosting}
            error={error}
            onLogout={onLogout}
          />
        </div>
      )}
    </div>
  );
}
