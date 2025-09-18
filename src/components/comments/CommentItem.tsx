"use client";

import Image from "next/image";
import { useState } from "react";
/* eslint-disable @typescript-eslint/no-explicit-any */

import CommentForm from "./CommentForm";
import CommentList from "./CommentList";
import { useDeleteComment, useEditComment, useModerateComment } from "./hooks";
import type { Comment, UserInfo } from "./types";

interface CommentItemProps {
  comment: Comment;
  postSlug: string;
  onCommentPosted: (message?: string) => void;
  userInfo: UserInfo | null;
  postComment: (commentData: {
    postSlug: string;
    content: string;
    parentId?: string;
    author?: Omit<UserInfo, "id" | "avatarUrl">;
  }) => Promise<any>;
  isPosting: boolean;
  error: string | null;
  onLogout: () => void;
  onLoginSuccess: () => Promise<void>;
  isAdmin: boolean;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function CommentItem({
  comment,
  postSlug,
  onCommentPosted,
  userInfo,
  postComment,
  isPosting,
  error,
  onLogout,
  onLoginSuccess,
  isAdmin,
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { moderateComment, isModerating } = useModerateComment();
  const { editComment, isEditing: isEditingComment } = useEditComment();
  const { deleteComment, isDeleting } = useDeleteComment();

  const handleReplyPosted = () => {
    setIsReplying(false);
    onCommentPosted();
  };

  const handleModerate = async (status: "approved" | "rejected") => {
    try {
      await moderateComment(comment.id, status);
      onCommentPosted(`留言已成功 ${status === "approved" ? "批准" : "拒绝"}.`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditSave = async () => {
    try {
      await editComment(comment.id, editContent);
      setIsEditing(false);
      onCommentPosted("评论已更新");
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteComment(comment.id);
      onCommentPosted("评论已删除");
      setShowDeleteConfirm(false);
    } catch (e) {
      console.error(e);
      setShowDeleteConfirm(false);
    }
  };

  const canEdit = userInfo && (userInfo.email === comment.authorEmail || isAdmin);
  const canDelete = userInfo && (userInfo.email === comment.authorEmail || isAdmin);

  return (
    <div className="py-4">
      <div className="flex items-start gap-4">
        <div className="avatar">
          <div className="w-12 h-12 rounded-full">
            <Image
              src={comment.author.avatarUrl}
              alt={comment.author.nickname || "用户"}
              className="rounded-full"
              width={48}
              height={48}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <h4 className="font-semibold text-base-content">{comment.author.nickname}</h4>
            <time
              className="text-sm text-base-content/60"
              dateTime={new Date(comment.createdAt).toISOString()}
            >
              {formatDate(comment.createdAt)}
            </time>
            {comment.status === "pending" && (
              <span className="badge badge-warning badge-sm gap-1">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                待审核
              </span>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <textarea
                className="textarea textarea-bordered w-full h-24 resize-none focus:textarea-primary"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="编辑评论内容..."
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleEditSave}
                  className="btn btn-primary btn-sm gap-2"
                  disabled={isEditingComment}
                >
                  {isEditingComment ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      保存中...
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
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      保存
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn btn-ghost btn-sm gap-2"
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <p className="text-base-content leading-relaxed">{comment.content}</p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-base-200">
            <div className="btn-group">
              <button
                type="button"
                onClick={() => setIsReplying(!isReplying)}
                className={`btn btn-ghost btn-sm gap-2 ${isReplying ? "btn-active" : ""}`}
              >
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
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                回复
              </button>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className={`btn btn-ghost btn-sm gap-2 ${isEditing ? "btn-active" : ""}`}
                >
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  编辑
                </button>
              )}

              {canDelete && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn btn-ghost btn-sm gap-2 text-error hover:bg-error hover:text-error-content"
                >
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  删除
                </button>
              )}
            </div>

            {isAdmin && comment.status === "pending" && (
              <div className="btn-group ml-auto">
                <button
                  type="button"
                  onClick={() => handleModerate("approved")}
                  className="btn btn-success btn-sm gap-2"
                  disabled={isModerating}
                >
                  {isModerating ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  批准
                </button>
                <button
                  type="button"
                  onClick={() => handleModerate("rejected")}
                  className="btn btn-error btn-sm gap-2"
                  disabled={isModerating}
                >
                  {isModerating ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                  拒绝
                </button>
              </div>
            )}
          </div>

          {isReplying && (
            <div className="mt-6 p-4 bg-base-50 rounded-lg">
              <div className="flex items-center gap-2 mb-4">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                <span className="text-sm font-medium text-base-content/70">
                  回复 {comment.author.nickname}
                </span>
              </div>
              <CommentForm
                postSlug={postSlug}
                parentId={comment.id}
                onCommentPosted={handleReplyPosted}
                userInfo={userInfo}
                postComment={postComment}
                isPosting={isPosting}
                error={error}
                onLogout={onLogout}
                onLoginSuccess={onLoginSuccess}
              />
            </div>
          )}

          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-6 pl-4">
              <div className="flex items-center gap-2 mb-4">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span className="text-sm font-medium text-base-content/70">
                  {comment.replies.length} 条回复
                </span>
              </div>
              <CommentList
                comments={comment.replies}
                postSlug={postSlug}
                onCommentPosted={onCommentPosted}
                userInfo={userInfo}
                postComment={postComment}
                isPosting={isPosting}
                error={error}
                onLogout={onLogout}
                onLoginSuccess={onLoginSuccess}
                isAdmin={isAdmin}
              />
            </div>
          )}
        </div>
      </div>

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-error/10">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6 text-error"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-lg text-base-content">确认删除</h3>
                <p className="text-sm text-base-content/60">此操作不可撤销</p>
              </div>
            </div>

            <div className="bg-base-100 p-4 rounded-lg border border-base-200 mb-6">
              <p className="text-sm text-base-content/80">
                确定要删除这条评论吗？删除后将无法恢复，包括所有回复内容。
              </p>
            </div>

            <div className="modal-action">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn btn-error gap-2"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    删除中...
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    确认删除
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-ghost gap-2"
                disabled={isDeleting}
              >
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
