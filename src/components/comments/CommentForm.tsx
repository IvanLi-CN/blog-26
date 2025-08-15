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
    <div className="card bg-base-100 shadow-xl mt-6">
      <div className="card-body">
        <h3 className="card-title">
          {parentId ? "回复评论" : "发表评论"}
          {userInfo && (
            <div className="flex items-center gap-2 text-sm">
              <span>欢迎，{userInfo.nickname}</span>
              <button type="button" onClick={onLogout} className="btn btn-ghost btn-xs">
                退出
              </button>
            </div>
          )}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!userInfo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label" htmlFor={nicknameId}>
                  <span className="label-text">昵称 *</span>
                </label>
                <input
                  id={nicknameId}
                  type="text"
                  placeholder="请输入昵称"
                  className="input input-bordered"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                />
              </div>
              <div className="form-control">
                <label className="label" htmlFor={emailId}>
                  <span className="label-text">邮箱 *</span>
                </label>
                <input
                  id={emailId}
                  type="email"
                  placeholder="请输入邮箱"
                  className="input input-bordered"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-control">
            <label className="label" htmlFor={contentId}>
              <span className="label-text">评论内容 *</span>
            </label>
            <textarea
              id={contentId}
              className="textarea textarea-bordered h-24"
              placeholder="请输入评论内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            ></textarea>
          </div>

          {!userInfo && (
            <div className="form-control">
              <div
                className="l-captcha"
                data-site-key={process.env.NEXT_PUBLIC_LUOSIMAO_SITE_KEY}
                data-callback="handleCaptchaSuccess"
              ></div>
              {captchaError && <div className="text-error text-sm mt-2">{captchaError}</div>}
            </div>
          )}

          {error && (
            <div role="alert" className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          <div className="card-actions justify-end">
            <button type="submit" className="btn btn-primary" disabled={isPosting}>
              {isPosting ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  发布中...
                </>
              ) : (
                "发布评论"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
