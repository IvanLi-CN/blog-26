import { useState } from 'react';
import CommentEditForm from './CommentEditForm';
import CommentForm from './CommentForm';
import CommentList from './CommentList';
import { useDeleteComment, useEditComment, useModerateComment } from './hooks';
import Reactions from './Reactions';
import type { Comment, UserInfo } from './types';

interface CommentItemProps {
  comment: Comment;
  postSlug: string;
  onCommentPosted: (message?: string) => void;
  userInfo: UserInfo | null;
  postComment: (commentData: {
    postSlug: string;
    content: string;
    parentId?: string;
    author?: Omit<UserInfo, 'id' | 'avatarUrl'>;
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
  const { moderateComment, isModerating, error: moderateError } = useModerateComment();
  const { editComment, isEditing: isEditingComment, error: editError } = useEditComment();
  const { deleteComment, isDeleting, error: deleteError } = useDeleteComment();

  const handleReplyPosted = () => {
    setIsReplying(false);
    onCommentPosted();
  };

  const handleModerate = async (status: 'approved' | 'rejected') => {
    try {
      await moderateComment(comment.id, status);
      onCommentPosted(`留言已成功 ${status === 'approved' ? '批准' : '拒绝'}.`);
    } catch (e) {
      // error is already set in the hook, maybe show a toast here
      console.error(e);
    }
  };

  const handleReplyClick = () => {
    setIsReplying(!isReplying);
  };

  const handleEditClick = () => {
    setIsEditing(!isEditing);
  };

  const handleEditSave = async (content: string) => {
    try {
      await editComment(comment.id, content);
      setIsEditing(false);
      onCommentPosted('评论已更新');
    } catch (e) {
      // error is already set in the hook
      console.error(e);
    }
  };

  const handleEditCancel = () => {
    setIsEditing(false);
  };

  const handleDeleteClick = async () => {
    if (window.confirm('确定要删除这条留言吗？')) {
      try {
        await deleteComment(comment.id);
        onCommentPosted('评论已删除');
      } catch (e) {
        // error is already set in the hook
        console.error(e);
      }
    }
  };

  // 判断当前用户是否可以编辑/删除评论
  const canEditDelete = userInfo && (userInfo.id === comment.authorId || isAdmin);

  return (
    <>
      <div
        id={`comment-${comment.id}`}
        className={`list-row rounded-lg p-4 shadow-sm border border-transparent dark:border-base-300 ${
          comment.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-base-100'
        }`}
      >
        {/* Avatar */}
        <div className="flex-shrink-0">
          <img src={comment.author.avatarUrl} alt={comment.author.nickname} className="w-10 h-10 rounded-full" />
        </div>

        {/* Main Content */}
        <div className="list-col-grow">
          <div className="flex items-center">
            <span className="font-bold">{comment.author.nickname}</span>
            {comment.status === 'pending' && <span className="badge badge-warning badge-sm ml-3">审核中</span>}
          </div>
          <time className="text-xs text-gray-500">{formatDate(comment.createdAt)}</time>
          {isEditing ? (
            <div className="mt-2">
              <CommentEditForm
                initialContent={comment.content}
                onSave={handleEditSave}
                onCancel={handleEditCancel}
                isEditing={isEditingComment}
                error={editError}
              />
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none mt-2">{comment.content}</div>
          )}

          <Reactions targetType="comment" targetId={comment.id} userInfo={userInfo} />

          {isAdmin && (
            <div className="mt-2 space-y-2">
              {comment.status === 'pending' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleModerate('approved')}
                    className="btn btn-success btn-xs"
                    disabled={isModerating}
                  >
                    {isModerating ? '...' : '批准'}
                  </button>
                  <button
                    onClick={() => handleModerate('rejected')}
                    className="btn btn-error btn-xs"
                    disabled={isModerating}
                  >
                    {isModerating ? '...' : '拒绝'}
                  </button>
                </div>
              )}
              {moderateError && <p className="text-error text-xs">{moderateError}</p>}
            </div>
          )}

          {/* 显示编辑/删除错误 */}
          {deleteError && <p className="text-error text-xs mt-2">{deleteError}</p>}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0">
          <div className="flex flex-col gap-1">
            <button onClick={handleReplyClick} className="text-xs btn btn-ghost btn-sm">
              {isReplying ? '取消留言' : '给 TA 留个言'}
            </button>
            {canEditDelete && !isEditing && (
              <div className="flex gap-1">
                <button onClick={handleEditClick} className="text-xs btn btn-ghost btn-sm" disabled={isDeleting}>
                  编辑
                </button>
                <button
                  onClick={handleDeleteClick}
                  className="text-xs btn btn-ghost btn-sm text-error hover:bg-error hover:text-error-content"
                  disabled={isDeleting}
                >
                  {isDeleting ? '删除中...' : '删除'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isReplying && (
        <div className="pl-14 mt-2 mb-4">
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
        <div className="pl-14">
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
    </>
  );
}
