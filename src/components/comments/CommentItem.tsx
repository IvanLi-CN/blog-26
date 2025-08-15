import { useState } from "react";
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
    <div className="border-l-2 border-base-300 pl-4">
      <div className="flex items-start gap-3">
        <div className="avatar">
          <div className="w-10 rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={comment.author.avatarUrl} alt={comment.author.nickname || "用户"} />
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">{comment.author.nickname}</span>
            <span className="text-sm text-base-content/60">{formatDate(comment.createdAt)}</span>
            {comment.status === "pending" && (
              <span className="badge badge-warning badge-sm">待审核</span>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                className="textarea textarea-bordered w-full"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleEditSave}
                  className="btn btn-primary btn-sm"
                  disabled={isEditingComment}
                >
                  {isEditingComment ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn btn-ghost btn-sm"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <p>{comment.content}</p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => setIsReplying(!isReplying)}
              className="btn btn-ghost btn-xs"
            >
              回复
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="btn btn-ghost btn-xs"
              >
                编辑
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-ghost btn-xs text-error"
              >
                删除
              </button>
            )}

            {isAdmin && comment.status === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => handleModerate("approved")}
                  className="btn btn-success btn-xs"
                  disabled={isModerating}
                >
                  批准
                </button>
                <button
                  type="button"
                  onClick={() => handleModerate("rejected")}
                  className="btn btn-error btn-xs"
                  disabled={isModerating}
                >
                  拒绝
                </button>
              </>
            )}
          </div>

          {isReplying && (
            <div className="mt-4">
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
            <div className="mt-4">
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
            <h3 className="font-bold text-lg">确认删除</h3>
            <p className="py-4">确定要删除这条评论吗？此操作不可撤销。</p>
            <div className="modal-action">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn btn-error"
                disabled={isDeleting}
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </button>
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className="btn">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
