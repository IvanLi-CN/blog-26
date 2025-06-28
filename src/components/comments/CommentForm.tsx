import React, { useEffect, useState } from 'react';
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
    captchaResponse?: string;
    author?: Omit<UserInfo, 'id' | 'avatarUrl'>;
  }) => Promise<any>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
  onLoginSuccess: () => Promise<void>;
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
  onLoginSuccess,
}: CommentFormProps) {
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');

  const [captchaResponse, setCaptchaResponse] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const handleCaptchaSuccess = (response: string) => {
    setCaptchaResponse(response);
    setCaptchaError(null);
  };

  useEffect(() => {
    // @ts-ignore
    window.handleCaptchaSuccess = handleCaptchaSuccess;
    return () => {
      // @ts-ignore
      delete window.handleCaptchaSuccess;
    };
  }, [handleCaptchaSuccess]);

  const handleInitialSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || (!userInfo && (!nickname.trim() || !email.trim()))) {
      return;
    }
    setVerificationError(null);
    setCaptchaError(null);

    const response = await postComment({
      postSlug,
      content,
      parentId,
      ...(!userInfo && { author: { nickname, email }, captchaResponse: captchaResponse ?? '' }),
    });

    if (response instanceof Response) {
      if (response.status === 401) {
        setCaptchaError('人机验证失败，请重试。');
        // @ts-ignore
        window.LUOCAPTCHA?.reset();
      } else if (response.status === 403) {
        setVerificationNeeded(true);
        fetch('/api/auth/send-verification-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      }
    } else if (response) {
      if (!userInfo) {
        window.location.reload();
      } else {
        setContent('');
        setVerificationNeeded(false);
        onCommentPosted();
      }
    }
  };

  const handleVerifyAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setVerificationError(null);

    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Verification failed.');
      }
      await onLoginSuccess();
      setVerificationNeeded(false);
      setVerificationCode('');
      await handleInitialSubmit();
    } catch (err: any) {
      setVerificationError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  if (verificationNeeded) {
    return (
      <div className="mt-4 p-4 border border-primary/20 rounded-lg bg-base-200/50">
        <h3 className="font-bold text-lg">验证您的邮箱</h3>
        <p className="text-sm text-base-content/80 mt-1">
          我们已向 <span className="font-bold">{email}</span> 发送了一个 6 位数的验证码。请输入验证码以继续。
        </p>
        <form onSubmit={handleVerifyAndSubmit} className="mt-4">
          <input
            type="text"
            placeholder="6 位数的验证码"
            className="input input-bordered w-full"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            required
            maxLength={6}
            pattern="\d{6}"
            title="请输入 6 位数字验证码"
          />
          <div className="flex justify-end items-center mt-2 gap-4">
            {verificationError && <p className="text-error text-sm mr-auto">{verificationError}</p>}
            <button type="button" className="btn btn-ghost" onClick={() => setVerificationNeeded(false)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={isVerifying || verificationCode.length !== 6}>
              {isVerifying ? <span className="loading loading-spinner" /> : '验证并提交'}
            </button>
          </div>
        </form>
      </div>
    );
  }

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
        <>
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
          {captchaError && <p className="text-error text-sm mb-2">{captchaError}</p>}
        </>
      )}
      <form onSubmit={handleInitialSubmit}>
        <textarea
          className="textarea textarea-bordered w-full"
          placeholder="留个言..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          disabled={isPosting}
        />
        <div className="flex items-center mt-2 gap-4 md:justify-end">
          {error && !verificationNeeded && <p className="text-error text-sm mr-auto">{error}</p>}
          {!userInfo && (
            <div className="mr-auto md:mr-0">
              <div
                className="l-captcha"
                data-site-key={import.meta.env.PUBLIC_LUOSIMAO_SITE_KEY}
                data-callback="handleCaptchaSuccess"
              ></div>
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPosting || !content.trim() || (!userInfo && !captchaResponse)}
          >
            {isPosting ? <span className="loading loading-spinner" /> : '提交'}
          </button>
        </div>
      </form>
    </div>
  );
}
