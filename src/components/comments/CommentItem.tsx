"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { Textarea } from "../ui/textarea";
/* eslint-disable @typescript-eslint/no-explicit-any */

import CommentAvatar from "./CommentAvatar";
import CommentForm from "./CommentForm";
import CommentList from "./CommentList";
import {
  useCommentReplies,
  useDeleteComment,
  useEditComment,
  useModerateComment,
  useRestoreComment,
} from "./hooks";
import type { Comment, UserInfo } from "./types";

interface CommentItemProps {
  comment: Comment;
  density?: "root" | "reply";
  postSlug: string;
  target?: { type: "article" | "memo" | "project"; key: string };
  onCommentPosted: (message?: string) => void;
  userInfo: UserInfo | null;
  postComment: (commentData: {
    postSlug: string;
    content: string;
    parentId?: string;
    target?: { type: "article" | "memo" | "project"; key: string };
    submissionKey?: string;
  }) => Promise<any>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
  onLoginSuccess: () => Promise<void>;
  isAdmin: boolean;
  usePublicSitePaths?: boolean;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN");
}

export default function CommentItem({
  comment,
  density = "root",
  postSlug,
  target,
  onCommentPosted,
  userInfo,
  postComment,
  isPosting,
  error,
  onLogout,
  onLoginSuccess,
  isAdmin,
  usePublicSitePaths = false,
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [loadedReplies, setLoadedReplies] = useState<Comment[]>([]);
  const [repliesCursor, setRepliesCursor] = useState(comment.repliesNextCursor ?? null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const { moderateComment, isModerating } = useModerateComment();
  const { editComment, isEditing: isEditingComment } = useEditComment();
  const { deleteComment, isDeleting } = useDeleteComment();
  const { restoreComment, isRestoring } = useRestoreComment();
  const { loadReplies, isLoading: isLoadingReplies } = useCommentReplies();

  useEffect(() => {
    setLoadedReplies([]);
    setRepliesCursor(comment.repliesNextCursor ?? null);
  }, [comment.repliesNextCursor]);

  useEffect(() => {
    if (!isMoreOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMoreOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreOpen]);

  const handleReplyPosted = () => {
    setIsReplying(false);
    onCommentPosted();
  };

  const handleModerate = async (status: "approved" | "rejected") => {
    try {
      await moderateComment(comment.id, status, comment.revision);
      onCommentPosted(`留言已成功${status === "approved" ? "批准" : "拒绝"}。`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditSave = async () => {
    try {
      await editComment(comment.id, editContent, comment.revision);
      setIsEditing(false);
      onCommentPosted("评论已更新");
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteComment(comment.id, comment.revision);
      onCommentPosted("评论已删除");
      setShowDeleteConfirm(false);
    } catch (e) {
      console.error(e);
      setShowDeleteConfirm(false);
    }
  };

  const handleRestore = async () => {
    try {
      await restoreComment(comment.id, comment.revision);
      onCommentPosted("评论已恢复并进入待审核");
    } catch (e) {
      console.error(e);
    }
  };

  const canDelete = Boolean(comment.canDelete || isAdmin);
  const displayedReplies = [...comment.replies, ...loadedReplies];

  const handleLoadReplies = async () => {
    if (!repliesCursor || isLoadingReplies) return;
    try {
      const result = await loadReplies(comment.id, repliesCursor);
      setLoadedReplies((current) => [...current, ...result.replies]);
      setRepliesCursor(result.nextCursor);
    } catch {
      // The parent comment remains available; a later retry can use the same cursor.
    }
  };

  const isReply = density === "reply";

  return (
    <article className={`comment-item ${isReply ? "comment-item--reply" : "comment-item--root"}`}>
      <div className="comment-item__body flex items-start">
        <div className="comment-item__avatar shrink-0 overflow-hidden rounded-full border border-[rgba(var(--nature-border-rgb),0.72)]">
          <CommentAvatar
            avatarUrl={comment.author.avatarUrl}
            alt={comment.author.nickname || "用户"}
            className="h-full w-full rounded-full object-cover"
            width={28}
            height={28}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="comment-item__header flex flex-wrap items-center">
            <h4 className="font-semibold text-[color:var(--nature-text)]">
              {comment.author.nickname}
            </h4>
            <time
              className="comment-item__meta text-sm text-[color:var(--nature-text-soft)]"
              dateTime={new Date(comment.createdAt).toISOString()}
              title={isAdmin ? formatDateTime(comment.createdAt) : undefined}
            >
              {formatDate(comment.createdAt)}
            </time>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div className="nature-input-shell nature-textarea-shell min-h-[8rem]">
                <Textarea
                  className="min-h-[6rem] resize-y border-0 bg-transparent px-0 py-0 text-base leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="编辑评论内容..."
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleEditSave}
                  className="nature-button nature-button-primary"
                  disabled={isEditingComment}
                >
                  {isEditingComment ? (
                    <>
                      <span className="nature-spinner h-4 w-4" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Icon name="tabler:check" className="h-4 w-4" />
                      保存
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="nature-button nature-button-ghost"
                >
                  <Icon name="tabler:x" className="h-4 w-4" />
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="comment-item__content nature-prose max-w-none text-[color:var(--nature-text)]">
              <p className="mb-0 whitespace-pre-wrap leading-7">
                {comment.deleted && !isAdmin
                  ? "评论已删除"
                  : comment.placeholder
                    ? "评论暂不可见"
                    : comment.content}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="comment-item__actions mt-4 flex flex-wrap items-center gap-2 pt-1">
        {(displayedReplies.length > 0 ||
          (comment.status === "pending" && !comment.placeholder)) && (
          <div className="comment-item__action-meta">
            {displayedReplies.length > 0 && (
              <span className="comment-item__reply-count">
                <Icon name="tabler:messages" className="h-4 w-4" />
                {displayedReplies.length} 条回复
              </span>
            )}
            {comment.status === "pending" && !comment.placeholder && (
              <span className="comment-item__status nature-chip nature-chip-warning">
                <Icon name="tabler:clock-exclamation" className="h-3.5 w-3.5" />
                待审核
              </span>
            )}
          </div>
        )}

        {!comment.deleted && !comment.placeholder && comment.status === "approved" && (
          <button
            type="button"
            onClick={() => setIsReplying(!isReplying)}
            className="comment-action"
          >
            <Icon name="tabler:corner-down-left" className="h-4 w-4" />
            回复
          </button>
        )}

        {!isAdmin && canDelete && !comment.deleted && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="comment-action comment-action--danger"
          >
            <Icon name="tabler:trash" className="h-4 w-4" />
            删除
          </button>
        )}

        {isAdmin && (
          <div ref={moreMenuRef} className="comment-more-menu">
            <button
              type="button"
              className="comment-action comment-more-menu__trigger"
              aria-label="更多评论操作"
              aria-expanded={isMoreOpen}
              aria-haspopup="menu"
              title="更多评论操作"
              onClick={() => setIsMoreOpen((current) => !current)}
            >
              <Icon name="tabler:dots-vertical" className="h-4 w-4" />
              <span className="sr-only">更多评论操作</span>
            </button>
            {isMoreOpen ? (
              <div className="comment-more-menu__content" role="menu" aria-label="更多评论操作">
                {comment.deleted ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="comment-more-menu__item comment-action--status"
                    onClick={() => {
                      setIsMoreOpen(false);
                      void handleRestore();
                    }}
                    disabled={isRestoring}
                  >
                    {isRestoring ? (
                      <span className="nature-spinner h-4 w-4" />
                    ) : (
                      <Icon name="tabler:restore" className="h-4 w-4" />
                    )}
                    恢复待审
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="comment-more-menu__item"
                      onClick={() => {
                        setIsMoreOpen(false);
                        setIsEditing(!isEditing);
                      }}
                    >
                      <Icon name="tabler:edit" className="h-4 w-4" />
                      编辑
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="comment-more-menu__item comment-action--danger"
                      onClick={() => {
                        setIsMoreOpen(false);
                        setShowDeleteConfirm(true);
                      }}
                      disabled={isDeleting}
                    >
                      <Icon name="tabler:trash" className="h-4 w-4" />
                      软删除
                    </button>
                    {comment.status === "pending" ? (
                      <>
                        <hr className="comment-more-menu__divider" />
                        <button
                          type="button"
                          role="menuitem"
                          className="comment-more-menu__item comment-action--approve"
                          onClick={() => {
                            setIsMoreOpen(false);
                            void handleModerate("approved");
                          }}
                          disabled={isModerating}
                        >
                          {isModerating ? (
                            <span className="nature-spinner h-4 w-4" />
                          ) : (
                            <Icon name="tabler:check" className="h-4 w-4" />
                          )}
                          批准
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="comment-more-menu__item comment-action--danger"
                          onClick={() => {
                            setIsMoreOpen(false);
                            void handleModerate("rejected");
                          }}
                          disabled={isModerating}
                        >
                          {isModerating ? (
                            <span className="nature-spinner h-4 w-4" />
                          ) : (
                            <Icon name="tabler:x" className="h-4 w-4" />
                          )}
                          拒绝
                        </button>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {isReplying && (
        <div className="comment-item__reply-form mt-4 pt-1">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--nature-text-soft)]">
            <Icon
              name="tabler:corner-down-left"
              className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
            />
            回复 {comment.author.nickname}
          </div>
          <CommentForm
            postSlug={postSlug}
            target={target}
            parentId={comment.id}
            onCommentPosted={handleReplyPosted}
            userInfo={userInfo}
            postComment={postComment}
            isPosting={isPosting}
            error={error}
            onLogout={onLogout}
            onLoginSuccess={onLoginSuccess}
            usePublicSitePaths={usePublicSitePaths}
          />
        </div>
      )}

      {displayedReplies.length > 0 && (
        <div className="comment-item__replies">
          <CommentList
            comments={displayedReplies}
            density="reply"
            postSlug={postSlug}
            target={target}
            onCommentPosted={onCommentPosted}
            userInfo={userInfo}
            postComment={postComment}
            isPosting={isPosting}
            error={error}
            onLogout={onLogout}
            onLoginSuccess={onLoginSuccess}
            isAdmin={isAdmin}
            usePublicSitePaths={usePublicSitePaths}
          />
          {repliesCursor ? (
            <button
              type="button"
              className="nature-button nature-button-ghost mt-3 min-h-9 px-3 py-2 text-sm"
              onClick={() => void handleLoadReplies()}
              disabled={isLoadingReplies}
            >
              {isLoadingReplies ? "正在加载…" : "加载更多回复"}
            </button>
          ) : null}
        </div>
      )}

      {showDeleteConfirm && (
        <div className="nature-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="nature-modal-backdrop"
            onClick={() => setShowDeleteConfirm(false)}
            aria-label="关闭删除确认"
          />
          <div className="nature-modal-panel w-full max-w-md">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--nature-danger)_14%,transparent)] text-[color:var(--nature-danger)]">
                <Icon name="tabler:alert-triangle" className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--nature-text)]">确认删除</h3>
                <p className="text-sm text-[color:var(--nature-text-soft)]">此操作不可撤销</p>
              </div>
            </div>
            <div className="nature-panel-soft mt-5 px-4 py-4 text-sm text-[color:var(--nature-text-soft)]">
              确定要删除这条评论吗？评论会被软删除，回复关系会保留。
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="nature-button nature-button-ghost"
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="nature-button nature-button-danger"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span className="nature-spinner h-4 w-4" />
                ) : (
                  <Icon name="tabler:trash" className="h-4 w-4" />
                )}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
