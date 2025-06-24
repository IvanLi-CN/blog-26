import React, { useState } from 'react';
import type { UserInfo } from './types';

interface CommentFormProps {
  postSlug: string;
  parentId?: string;
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

export default function CommentForm({
  postSlug,
  parentId,
  onCommentPosted,
  userInfo,
  postComment,
  isPosting,
  error,
  onLogout,
}: CommentFormProps) {
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState(userInfo?.nickname || 'Test User');
  const [email, setEmail] = useState(userInfo?.email || 'test@example.com');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // This is the key to preventing page reloads.

    if (!content.trim() || (!userInfo && (!nickname.trim() || !email.trim()))) {
      return;
    }

    try {
      await postComment({
        postSlug,
        content,
        parentId,
        ...(!userInfo && { author: { nickname, email } }),
      });
      setContent('');
      onCommentPosted();
    } catch {
      // Error is handled in the usePostComment hook.
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <textarea
        className="textarea textarea-bordered w-full"
        placeholder="发表你的评论..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
        disabled={isPosting}
      />
      {!userInfo && (
        <div className="flex gap-4 mt-2">
          <input
            type="text"
            placeholder="昵称"
            className="input input-bordered w-full"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            disabled={isPosting}
          />
          <input
            type="email"
            placeholder="邮箱"
            className="input input-bordered w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPosting}
          />
        </div>
      )}
      <div className="flex justify-end items-center mt-2 gap-4">
        {error && <p className="text-error text-sm">{error}</p>}
        {userInfo && (
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            登出
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={isPosting}>
          {isPosting ? <span className="loading loading-spinner" /> : '提交'}
        </button>
      </div>
    </form>
  );
}
