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
    author?: Omit<UserInfo, 'id' | 'avatarUrl'>;
  }) => Promise<any>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
  onLoginSuccess: () => Promise<void>;
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
  onLoginSuccess,
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
    <>
      <div
        id={`comment-${comment.id}`}
        className="list-row rounded-lg bg-base-100 p-4 shadow-sm border border-transparent dark:border-base-300"
      >
        {/* Avatar */}
        <div className="flex-shrink-0">
          <img src={comment.author.avatarUrl} alt={comment.author.nickname} className="w-10 h-10 rounded-full" />
        </div>

        {/* Main Content */}
        <div className="list-col-grow">
          <div className="flex items-center">
            <span className="font-bold">{comment.author.nickname}</span>
            {comment.status === 'pending' && <span className="badge badge-warning badge-sm ml-3">审核中</span>}
          </div>
          <time className="text-xs text-gray-500">{formatDate(comment.createdAt)}</time>
          <div className="prose prose-sm dark:prose-invert max-w-none mt-2">{comment.content}</div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0">
          <button onClick={handleReplyClick} className="text-xs btn btn-ghost btn-sm">
            {isReplying ? '取消回复' : '回复'}
          </button>
        </div>
      </div>

      {isReplying && (
        <div className="pl-14 mt-2 mb-4">
          <CommentForm
            postSlug={postSlug}
            parentId={comment.id}
            onCommentPosted={handleReplyPosted}
            userInfo={userInfo}
            postComment={postComment}
            isPosting={isPosting}
            error={error}
            onLogout={onLogout}
            onLoginSuccess={onLoginSuccess}
          />
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="pl-14">
          <CommentList
            comments={comment.replies}
            postSlug={postSlug}
            onCommentPosted={onCommentPosted}
            userInfo={userInfo}
            postComment={postComment}
            isPosting={isPosting}
            error={error}
            onLogout={onLogout}
            onLoginSuccess={onLoginSuccess}
          />
        </div>
      )}
    </>
  );
}
