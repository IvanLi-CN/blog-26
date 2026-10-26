"use client";

import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { toPublicApiUrl } from "@/lib/public-runtime-url";
import Icon from "../ui/Icon";
import { Textarea } from "../ui/textarea";
import CommentAvatar from "./CommentAvatar";
import type { UserInfo } from "./types";

type CommentTarget = { type: "article" | "memo" | "project"; key: string };

interface CommentFormProps {
  postSlug: string;
  target?: CommentTarget;
  parentId?: string;
  onCommentPosted: (message?: string) => void;
  userInfo: UserInfo | null;
  postComment: (commentData: {
    postSlug: string;
    content: string;
    parentId?: string;
    target?: CommentTarget;
    submissionKey?: string;
  }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
  onLoginSuccess: () => Promise<void>;
  usePublicSitePaths?: boolean;
}

function draftKey(target: CommentTarget | undefined, postSlug: string, parentId?: string) {
  return `reader-comment-draft:${target?.type || "article"}:${target?.key || postSlug}:${parentId || "root"}`;
}

export default function CommentForm({
  postSlug,
  target,
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
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);
  const contentId = useId();
  const submissionKey = useRef<string>(crypto.randomUUID());
  const key = draftKey(target, postSlug, parentId);

  useEffect(() => {
    let draft = "";
    try {
      draft = window.sessionStorage.getItem(key) ?? "";
    } finally {
      setContent(draft);
      setLoadedDraftKey(key);
    }
  }, [key]);

  useEffect(() => {
    if (loadedDraftKey !== key || !content.trim()) return;
    window.sessionStorage.setItem(key, content);
  }, [content, key, loadedDraftKey]);

  const startLogin = () => {
    window.sessionStorage.setItem(key, content);
    const returnTo = window.location.href;
    const loginUrl = new URL(toPublicApiUrl("/api/public/reader-auth/github/start"));
    loginUrl.searchParams.set("returnTo", returnTo);
    window.location.assign(loginUrl.toString());
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!userInfo || !trimmed) return;
    const response = await postComment({
      postSlug,
      target,
      content: trimmed,
      parentId,
      submissionKey: submissionKey.current,
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { message?: string };
    setContent("");
    window.sessionStorage.removeItem(key);
    submissionKey.current = crypto.randomUUID();
    onCommentPosted(payload.message);
  };

  return (
    <div className="comment-form space-y-3">
      {!userInfo ? (
        <div className="comment-auth-row comment-auth-row--guest flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-[color:var(--nature-text)]">登录后参与讨论</p>
            <p className="mt-0.5 text-xs leading-5 text-[color:var(--nature-text-soft)]">
              评论会在审核通过后公开显示。
            </p>
          </div>
          <button
            type="button"
            onClick={startLogin}
            className="nature-button nature-button-primary min-h-9 shrink-0 px-3 py-1.5 text-sm"
          >
            <Icon name="tabler:brand-github" className="h-4 w-4" />
            GitHub 登录
          </button>
        </div>
      ) : (
        <div className="comment-auth-row flex items-center gap-3">
          <div className="overflow-hidden rounded-full border border-[rgba(var(--nature-border-rgb),0.72)]">
            <CommentAvatar
              avatarUrl={userInfo.avatarUrl}
              alt={userInfo.nickname}
              className="h-8 w-8 rounded-full object-cover"
              width={32}
              height={32}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[color:var(--nature-text)]">{userInfo.nickname}</h3>
            <p className="text-xs text-[color:var(--nature-text-soft)]">
              {userInfo.isAdminAuthor ? "GitHub 管理员" : "GitHub 读者"}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="nature-button nature-button-ghost min-h-9 shrink-0 px-3 py-2 text-sm"
          >
            <Icon name="tabler:logout-2" className="h-4 w-4" />
            登出
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor={contentId}
              className="text-xs font-medium text-[color:var(--nature-text-soft)]"
            >
              评论内容
            </label>
            <span className="text-[0.7rem] tabular-nums text-[color:var(--nature-text-soft)]">
              {content.length}/1000
            </span>
          </div>
          <div className="nature-input-shell nature-textarea-shell">
            <Textarea
              id={contentId}
              className="min-h-[4.75rem] resize-y border-0 bg-transparent px-0 py-0 text-[0.95rem] leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder={userInfo ? "分享你的想法..." : "登录后即可评论"}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={1000}
              aria-label="评论内容"
            />
          </div>
        </div>
        <div className="flex justify-end pt-0.5">
          <button
            type="submit"
            className="nature-button nature-button-primary min-h-10 justify-center px-4 py-2"
            disabled={!userInfo || isPosting || !content.trim()}
          >
            {isPosting ? (
              <>
                <span className="nature-spinner h-4 w-4" />
                提交中...
              </>
            ) : (
              <>
                <Icon name="tabler:send-2" className="h-4 w-4" />
                {userInfo?.isAdminAuthor ? "直接发布" : "提交审核"}
              </>
            )}
          </button>
        </div>
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
