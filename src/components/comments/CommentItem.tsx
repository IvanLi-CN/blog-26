"use client";

import Image from "next/image";
import { useState } from "react";
import Icon from "../ui/Icon";
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
  return new Date(timestamp).toLocaleString("zh-CN");
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
      onCommentPosted(`留言已成功${status === "approved" ? "批准" : "拒绝"}。`);
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
    <article className="nature-panel px-5 py-5">
      <div className="flex items-start gap-4">
        <div className="overflow-hidden rounded-full border border-[rgba(var(--nature-border-rgb),0.72)]">
          <Image
            src={comment.author.avatarUrl}
            alt={comment.author.nickname || "用户"}
            className="rounded-full"
            width={48}
            height={48}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h4 className="font-semibold text-[color:var(--nature-text)]">
              {comment.author.nickname}
            </h4>
            <time
              className="text-sm text-[color:var(--nature-text-soft)]"
              dateTime={new Date(comment.createdAt).toISOString()}
            >
              {formatDate(comment.createdAt)}
            </time>
            {comment.status === "pending" && (
              <span className="nature-chip nature-chip-warning gap-1">
                <Icon name="tabler:clock-exclamation" className="h-3.5 w-3.5" />
                待审核
              </span>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <textarea
                className="nature-textarea min-h-[6rem]"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="编辑评论内容..."
              />
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
            <div className="nature-prose max-w-none text-[color:var(--nature-text)]">
              <p className="mb-0 whitespace-pre-wrap leading-7">{comment.content}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[rgba(var(--nature-border-rgb),0.56)] pt-3">
            <button
              type="button"
              onClick={() => setIsReplying(!isReplying)}
              className="nature-button nature-button-ghost min-h-9 px-3 py-2 text-sm"
            >
              <Icon name="tabler:corner-down-left" className="h-4 w-4" />
              回复
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="nature-button nature-button-ghost min-h-9 px-3 py-2 text-sm"
              >
                <Icon name="tabler:edit" className="h-4 w-4" />
                编辑
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="nature-button nature-button-ghost min-h-9 px-3 py-2 text-sm text-[color:var(--nature-danger)]"
              >
                <Icon name="tabler:trash" className="h-4 w-4" />
                删除
              </button>
            )}

            {isAdmin && comment.status === "pending" && (
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleModerate("approved")}
                  className="nature-button nature-button-primary min-h-9 px-3 py-2 text-sm"
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
                  onClick={() => handleModerate("rejected")}
                  className="nature-button nature-button-danger min-h-9 px-3 py-2 text-sm"
                  disabled={isModerating}
                >
                  {isModerating ? (
                    <span className="nature-spinner h-4 w-4" />
                  ) : (
                    <Icon name="tabler:x" className="h-4 w-4" />
                  )}
                  拒绝
                </button>
              </div>
            )}
          </div>

          {isReplying && (
            <div className="nature-panel-soft mt-5 px-4 py-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--nature-text-soft)]">
                <Icon
                  name="tabler:corner-down-left"
                  className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
                />
                回复 {comment.author.nickname}
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
            <div className="mt-6 border-l border-[rgba(var(--nature-border-rgb),0.58)] pl-4 sm:pl-6">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[color:var(--nature-text-soft)]">
                <Icon
                  name="tabler:messages"
                  className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
                />
                {comment.replies.length} 条回复
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
              确定要删除这条评论吗？删除后将无法恢复，包括所有回复内容。
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
