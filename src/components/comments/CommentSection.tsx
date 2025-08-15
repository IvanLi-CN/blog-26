"use client";

import { useEffect, useState } from "react";
import CommentForm from "./CommentForm";
import CommentList from "./CommentList";
import { useComments, usePostComment, useUserInfo } from "./hooks";

// 文本配置
const DEFAULT_TEXTS = {
  title: "留言",
  submitSuccess: "留言已提交，正在等待审核。",
  loadingText: "加载中...",
  loadMoreText: "加载更多",
};

interface CommentSectionProps {
  postSlug: string;
  title?: string;
  texts?: Partial<typeof DEFAULT_TEXTS>;
}

export default function CommentSection({ postSlug, title, texts = {} }: CommentSectionProps) {
  const finalTexts = { ...DEFAULT_TEXTS, ...texts };
  const displayTitle = title || finalTexts.title;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // 标记为客户端环境
    setIsClient(true);

    const scriptId = "luosimao-captcha-script";
    if (document.getElementById(scriptId)) {
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "//captcha.luosimao.com/static/dist/api.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      const scriptElement = document.getElementById(scriptId);
      if (scriptElement) {
        document.body.removeChild(scriptElement);
      }
    };
  }, []);

  const {
    comments,
    isLoading: isCommentsLoading,
    error: commentsError,
    page,
    totalPages: liveTotalPages,
    loadMore,
    refetch,
    isAdmin,
  } = useComments({
    postSlug,
  });
  const { userInfo, logout, isLoading: isUserLoading, refetchUserInfo } = useUserInfo();
  const { postComment, isPosting, error: postError } = usePostComment();
  const [successMessage, setSuccessMessage] = useState("");

  const handleCommentPosted = async (message: string = finalTexts.submitSuccess) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(""), 5000);
    refetch(); // Refetch comments to show the new one
  };

  // 只有在客户端环境才渲染组件
  if (!isClient) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold">{displayTitle}</h2>

      {successMessage && (
        <div role="alert" className="alert alert-success mt-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
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
          onLoginSuccess={refetchUserInfo}
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
          onLoginSuccess={refetchUserInfo}
          isAdmin={isAdmin}
        />

        {page < liveTotalPages && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={loadMore}
              className="btn btn-primary"
              disabled={isCommentsLoading}
            >
              {isCommentsLoading ? finalTexts.loadingText : finalTexts.loadMoreText}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
