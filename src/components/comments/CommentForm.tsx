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
    author?: Omit<UserInfo, 'id' | 'avatarUrl'>;
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
  const [nickname, setNickname] = useState('Test User');
  const [email, setEmail] = useState('test@example.com');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
    <div className="mt-4">
      {userInfo ? (
        <div className="flex items-center gap-4 mb-4">
          <img src={userInfo.avatarUrl} alt={userInfo.nickname} className="w-10 h-10 rounded-full" />
          <div>
            <p className="font-bold">{userInfo.nickname}</p>
            <p className="text-sm text-gray-500">{userInfo.email}</p>
          </div>
          <button type="button" className="btn btn-ghost ml-auto" onClick={onLogout}>
            登出
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
          <input
            type="text"
            placeholder="昵称 (必填)"
            className="input input-bordered w-full"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            disabled={isPosting}
          />
          <input
            type="email"
            placeholder="邮箱 (必填)"
            className="input input-bordered w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPosting}
          />
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <textarea
          className="textarea textarea-bordered w-full"
          placeholder="发表你的评论..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          disabled={isPosting}
        />
        <div className="flex justify-end items-center mt-2 gap-4">
          {error && <p className="text-error text-sm">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isPosting || !content.trim()}>
            {isPosting ? <span className="loading loading-spinner" /> : '提交'}
          </button>
        </div>
      </form>
    </div>
  );
}
