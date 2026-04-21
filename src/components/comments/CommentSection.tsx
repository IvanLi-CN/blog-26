"use client";

import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import CommentForm from "./CommentForm";
import CommentList from "./CommentList";
import { useComments, usePostComment, useUserInfo } from "./hooks";

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
  usePublicSitePaths?: boolean;
}

export default function CommentSection({
  postSlug,
  title,
  texts = {},
  usePublicSitePaths = false,
}: CommentSectionProps) {
  const finalTexts = { ...DEFAULT_TEXTS, ...texts };
  const displayTitle = title || finalTexts.title;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
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
    refetch();
  };

  if (!isClient) {
    return null;
  }

  return (
    <section className="mt-16">
      <div className="mb-8 flex items-center gap-3">
        <div className="nature-empty-icon h-10 w-10">
          <Icon name="tabler:messages" className="h-5 w-5" />
        </div>
        <div>
          <div className="nature-kicker">Conversation</div>
          <h2 className="mt-2 text-2xl font-semibold text-[color:var(--nature-text)]">
            {displayTitle}
          </h2>
        </div>
      </div>

      {successMessage && (
        <div role="alert" className="nature-alert nature-alert-success mb-6">
          <Icon name="tabler:circle-check" className="h-5 w-5" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="nature-panel px-5 py-5 sm:px-6">
        {isUserLoading ? (
          <div className="flex items-center justify-center p-8 text-[color:var(--nature-text-soft)]">
            <span className="nature-spinner h-5 w-5" />
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
            usePublicSitePaths={usePublicSitePaths}
          />
        )}
      </div>

      <div className="mt-8">
        {isCommentsLoading && page === 1 && (
          <div className="flex items-center justify-center p-8 text-[color:var(--nature-text-soft)]">
            <span className="nature-spinner h-5 w-5" />
          </div>
        )}
        {commentsError && (
          <div className="nature-alert nature-alert-error mb-6">
            <Icon name="tabler:alert-triangle" className="h-5 w-5" />
            <span>{commentsError}</span>
          </div>
        )}

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
          usePublicSitePaths={usePublicSitePaths}
        />

        {page < liveTotalPages && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={loadMore}
              className="nature-button nature-button-outline gap-2"
              disabled={isCommentsLoading}
            >
              {isCommentsLoading ? (
                <>
                  <span className="nature-spinner h-4 w-4" />
                  {finalTexts.loadingText}
                </>
              ) : (
                <>
                  <Icon name="tabler:arrow-down" className="h-4 w-4" />
                  {finalTexts.loadMoreText}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
