import type React from "react";
import { useCallback, useEffect, useId, useState } from "react";
import type { UserInfo } from "./types";

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
    author?: Omit<UserInfo, "id" | "avatarUrl">;
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
  onLoginSuccess: _onLoginSuccess,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");

  const nicknameId = useId();
  const emailId = useId();
  const contentId = useId();

  const [captchaResponse, setCaptchaResponse] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  const handleCaptchaSuccess = useCallback((response: string) => {
    setCaptchaResponse(response);
    setCaptchaError(null);
  }, []);

  useEffect(() => {
    // @ts-ignore
    window.handleCaptchaSuccess = handleCaptchaSuccess;
    return () => {
      // @ts-ignore
      delete window.handleCaptchaSuccess;
    };
  }, [handleCaptchaSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || (!userInfo && (!nickname.trim() || !email.trim()))) {
      return;
    }
    setCaptchaError(null);

    const response = await postComment({
      postSlug,
      content,
      parentId,
      ...(!userInfo && { author: { nickname, email }, captchaResponse: captchaResponse ?? "" }),
    });

    if (response.ok) {
      setContent("");
      onCommentPosted();
    } else {
      const result = await response.json();
      if (result.error?.includes("验证")) {
        setCaptchaError("人机验证失败，请重试。");
        // @ts-ignore
        window.LUOCAPTCHA?.reset();
      }
    }
  };

  return (
    <div className="space-y-6">
      {userInfo && (
        <div className="flex items-center gap-4 mb-6 p-4 bg-base-50 rounded-lg">
          <div className="avatar">
            <div className="w-12 h-12 rounded-full">
              {/* biome-ignore lint/performance/noImgElement: Using plain <img> is acceptable for avatar here */}
              <img
                src={userInfo.avatarUrl || "/default-avatar.png"}
                alt={userInfo.nickname}
                className="rounded-full"
              />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base-content">{userInfo.nickname}</h3>
            <p className="text-sm text-base-content/60">{userInfo.email || "admin@example.com"}</p>
          </div>
          <button type="button" onClick={onLogout} className="btn btn-ghost btn-sm gap-2">
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-label="登出"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            登出
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {!userInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label" htmlFor={nicknameId}>
                <span className="label-text font-medium">昵称 *</span>
              </label>
              <input
                id={nicknameId}
                type="text"
                placeholder="请输入昵称"
                className="input input-bordered focus:input-primary"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
              />
            </div>
            <div className="form-control">
              <label className="label" htmlFor={emailId}>
                <span className="label-text font-medium">邮箱 *</span>
              </label>
              <input
                id={emailId}
                type="email"
                placeholder="请输入邮箱"
                className="input input-bordered focus:input-primary"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        <div className="form-control">
          <label className="label" htmlFor={contentId}>
            <span className="label-text font-medium">评论内容 *</span>
          </label>
          <div className="flex gap-3">
            <textarea
              id={contentId}
              className="textarea textarea-bordered flex-1 h-20 resize-none focus:textarea-primary"
              placeholder="分享你的想法..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              aria-label="评论内容"
            />
            <button
              type="submit"
              className="btn btn-primary gap-2 self-end"
              disabled={isPosting || !content.trim()}
            >
              {isPosting ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  提交中...
                </>
              ) : (
                <>
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  提交
                </>
              )}
            </button>
          </div>
        </div>

        {!userInfo && (
          <div className="form-control">
            <div className="label">
              <span className="label-text font-medium">人机验证</span>
            </div>
            <div className="p-4 bg-base-50 rounded-lg border border-base-200">
              <div
                className="l-captcha"
                data-site-key={process.env.NEXT_PUBLIC_LUOSIMAO_SITE_KEY}
                data-callback="handleCaptchaSuccess"
              ></div>
              {captchaError && (
                <div className="alert alert-error mt-3">
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{captchaError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="alert alert-error">
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}
