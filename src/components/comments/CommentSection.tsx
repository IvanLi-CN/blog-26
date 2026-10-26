"use client";

import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import CommentForm from "./CommentForm";
import CommentList from "./CommentList";
import { useComments, usePostComment, useUserInfo } from "./hooks";

const DEFAULT_TEXTS = {
  title: "评论",
  submitSuccess: "留言已提交，正在等待审核。",
  loadingText: "加载中...",
  loadMoreText: "加载更多",
};

interface CommentSectionProps {
  postSlug: string;
  target: { type: "article" | "memo" | "project"; key: string };
  title?: string;
  texts?: Partial<typeof DEFAULT_TEXTS>;
  usePublicSitePaths?: boolean;
  embedded?: boolean;
  allowCompose?: boolean;
}

export default function CommentSection({
  postSlug,
  target,
  title,
  texts = {},
  usePublicSitePaths = false,
  embedded = false,
  allowCompose = true,
}: CommentSectionProps) {
  const finalTexts = { ...DEFAULT_TEXTS, ...texts };
  const displayTitle = title || finalTexts.title;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
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
    viewState,
  } = useComments({
    postSlug,
    target,
  });
  const { userInfo, logout, isLoading: isUserLoading, refetchUserInfo } = useUserInfo();
  const { postComment, isPosting, error: postError } = usePostComment();
  const [successMessage, setSuccessMessage] = useState("");
  const hasCommentContext = viewState === "ready" || viewState === "ready-empty";
  const hasRecoverableComments = comments.length > 0;
  const showCommentComposer = hasCommentContext || hasRecoverableComments;

  const handleCommentPosted = async (message: string = finalTexts.submitSuccess) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(""), 5000);
    refetch();
  };

  if (!isClient) {
    return null;
  }

  return (
    <section className={`comment-section ${embedded ? "comment-section--embedded" : "mt-16"}`}>
      <div className={`comment-panel ${embedded ? "comment-panel--embedded" : "nature-panel"}`}>
        <div className="comment-panel__header flex items-center gap-3">
          <div className="comment-panel__icon" aria-hidden="true">
            <Icon name="tabler:messages" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[color:var(--nature-text)]">
              {displayTitle}
            </h2>
          </div>
        </div>

        {successMessage && (
          <div role="alert" className="comment-panel__alert nature-alert nature-alert-success">
            <Icon name="tabler:circle-check" className="h-5 w-5" />
            <span>{successMessage}</span>
          </div>
        )}

        {allowCompose && showCommentComposer && (
          <div className="comment-compose">
            {isUserLoading ? (
              <div className="flex items-center justify-center p-8 text-[color:var(--nature-text-soft)]">
                <span className="nature-spinner h-5 w-5" />
              </div>
            ) : (
              <CommentForm
                postSlug={postSlug}
                target={target}
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
        )}

        <div className="comment-thread">
          {viewState === "loading" && isCommentsLoading && page === 1 && (
            <div
              className="flex items-center justify-center p-8 text-[color:var(--nature-text-soft)]"
              data-testid="comments-loading"
              role="status"
              aria-live="polite"
              aria-label="正在加载评论"
            >
              <span className="nature-spinner h-5 w-5" />
            </div>
          )}
          {viewState === "target-unavailable" && (
            <div
              className="comment-state comment-state--unavailable"
              data-testid="comment-target-unavailable"
              role="status"
            >
              <Icon name="tabler:alert-triangle" className="h-5 w-5" />
              <div>
                <h3 className="font-semibold text-[color:var(--nature-text)]">评论目标不存在</h3>
                <p className="mt-1 text-sm text-[color:var(--nature-text-soft)]">
                  当前内容不可用，暂时无法显示评论。
                </p>
              </div>
            </div>
          )}
          {viewState === "error" && (
            <div
              className="comment-state comment-state--error"
              data-testid="comment-load-error"
              role="alert"
            >
              <Icon name="tabler:alert-triangle" className="h-5 w-5" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-[color:var(--nature-text)]">
                  评论加载失败，请重试
                </h3>
                {commentsError?.message && commentsError.message !== "Failed to fetch" && (
                  <p className="mt-1 text-sm text-[color:var(--nature-text-soft)]">
                    {commentsError.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="nature-button nature-button-ghost shrink-0"
                onClick={refetch}
                data-testid="comment-retry"
              >
                <Icon name="tabler:refresh" className="h-4 w-4" />
                重试
              </button>
            </div>
          )}

          {hasCommentContext && (
            <CommentList
              comments={comments}
              postSlug={postSlug}
              target={target}
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
          )}

          {hasCommentContext && commentsError && (
            <div className="comment-state comment-state--inline" role="alert">
              <Icon name="tabler:alert-triangle" className="h-5 w-5" />
              <span className="min-w-0 flex-1">评论加载失败，请重试</span>
              <button
                type="button"
                className="nature-button nature-button-ghost shrink-0"
                onClick={refetch}
                data-testid="comment-retry"
              >
                <Icon name="tabler:refresh" className="h-4 w-4" />
                重试
              </button>
            </div>
          )}

          {hasCommentContext && page < liveTotalPages && (
            <div className="comment-pagination text-center">
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
      </div>
    </section>
  );
}
