"use client";

import Image from "next/image";
import type React from "react";
import { useCallback, useEffect, useId, useState } from "react";
import Icon from "../ui/Icon";
import { Textarea } from "../ui/textarea";
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
  }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
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
    // @ts-expect-error - injected by captcha script
    window.handleCaptchaSuccess = handleCaptchaSuccess;
    return () => {
      // @ts-expect-error - injected by captcha script
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
      return;
    }

    const result = (await response.json()) as { error?: string };
    if (result.error?.includes("验证")) {
      setCaptchaError("人机验证失败，请重试。");
      // @ts-expect-error - injected by captcha script
      window.LUOCAPTCHA?.reset();
    }
  };

  return (
    <div className="space-y-6">
      {userInfo && (
        <div className="nature-panel-soft flex items-center gap-4 px-4 py-4">
          <div className="overflow-hidden rounded-full border border-[rgba(var(--nature-border-rgb),0.72)]">
            <Image
              src={userInfo.avatarUrl || "/default-avatar.png"}
              alt={userInfo.nickname}
              className="rounded-full"
              width={48}
              height={48}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[color:var(--nature-text)]">{userInfo.nickname}</h3>
            <p className="truncate text-sm text-[color:var(--nature-text-soft)]">
              {userInfo.email || "admin@example.com"}
            </p>
          </div>
          <button type="button" onClick={onLogout} className="nature-button nature-button-ghost">
            <Icon name="tabler:logout-2" className="h-4 w-4" />
            登出
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {!userInfo && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor={nicknameId}
                className="text-sm font-medium text-[color:var(--nature-text-soft)]"
              >
                昵称 *
              </label>
              <label className="nature-input-shell">
                <input
                  id={nicknameId}
                  type="text"
                  placeholder="请输入昵称"
                  className="nature-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="space-y-2">
              <label
                htmlFor={emailId}
                className="text-sm font-medium text-[color:var(--nature-text-soft)]"
              >
                邮箱 *
              </label>
              <label className="nature-input-shell">
                <input
                  id={emailId}
                  type="email"
                  placeholder="请输入邮箱"
                  className="nature-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor={contentId}
            className="text-sm font-medium text-[color:var(--nature-text-soft)]"
          >
            评论内容 *
          </label>
          <div className="space-y-3">
            <div className="nature-input-shell nature-textarea-shell">
              <Textarea
                id={contentId}
                className="min-h-[9rem] resize-y border-0 bg-transparent px-0 py-0 text-base leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="分享你的想法..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                aria-label="评论内容"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="nature-button nature-button-primary min-h-11 justify-center px-5 py-3"
                disabled={isPosting || !content.trim()}
              >
                {isPosting ? (
                  <>
                    <span className="nature-spinner h-4 w-4" />
                    提交中...
                  </>
                ) : (
                  <>
                    <Icon name="tabler:send-2" className="h-4 w-4" />
                    提交
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {!userInfo && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-[color:var(--nature-text-soft)]">人机验证</div>
            <div className="nature-panel-soft px-4 py-4">
              <div
                className="l-captcha"
                data-site-key={process.env.NEXT_PUBLIC_LUOSIMAO_SITE_KEY}
                data-callback="handleCaptchaSuccess"
              ></div>
              {captchaError && (
                <div className="nature-alert nature-alert-error mt-4">
                  <Icon name="tabler:alert-triangle" className="h-5 w-5" />
                  <span>{captchaError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="nature-alert nature-alert-error">
            <Icon name="tabler:alert-triangle" className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}
