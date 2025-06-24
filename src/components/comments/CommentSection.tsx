'use client';

import React, { useState } from 'react';
import CommentForm from './CommentForm';
import CommentList from './CommentList';
import { useComments, usePostComment, useUserInfo } from './hooks';

interface CommentSectionProps {
  postSlug: string;
}

export default function CommentSection({ postSlug }: CommentSectionProps) {
  const {
    comments,
    isLoading: isCommentsLoading,
    error: commentsError,
    page,
    totalPages: liveTotalPages,
    loadMore,
    refetch,
  } = useComments({
    postSlug,
  });
  const { userInfo, logout, isLoading: isUserLoading } = useUserInfo();
  const { postComment, isPosting, error: postError } = usePostComment();
  const [successMessage, setSuccessMessage] = useState('');

  const handleCommentPosted = async () => {
    setSuccessMessage('评论已提交，正在等待审核。');
    setTimeout(() => setSuccessMessage(''), 5000);
    refetch(); // Refetch comments to show the new one
  };

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold">评论</h2>

      {successMessage && (
        <div role="alert" className="alert alert-success mt-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      {isUserLoading ? (
        <div className="flex items-center justify-center p-8">
          <span className="loading loading-spinner" />
        </div>
      ) : (
        <CommentForm
          postSlug={postSlug}
          onCommentPosted={handleCommentPosted}
          userInfo={userInfo}
          postComment={postComment}
          isPosting={isPosting}
          error={postError}
          onLogout={logout}
        />
      )}

      <div className="mt-8">
        {isCommentsLoading && page === 1 && (
          <div className="flex items-center justify-center p-8">
            <span className="loading loading-spinner" />
          </div>
        )}
        {commentsError && <p className="text-error">{commentsError}</p>}

        <CommentList
          comments={comments}
          postSlug={postSlug}
          onCommentPosted={handleCommentPosted}
          userInfo={userInfo}
          postComment={postComment}
          isPosting={isPosting}
          error={postError}
          onLogout={logout}
        />

        {page < liveTotalPages && (
          <div className="text-center mt-4">
            <button onClick={loadMore} className="btn btn-primary" disabled={isCommentsLoading}>
              {isCommentsLoading ? '加载中...' : '加载更多'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
