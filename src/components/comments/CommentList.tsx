import CommentItem from './CommentItem';
import type { Comment, UserInfo } from './types';

interface CommentListProps {
  comments: Comment[];
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

export default function CommentList({
  comments,
  postSlug,
  onCommentPosted,
  userInfo,
  postComment,
  isPosting,
  error,
  onLogout,
  onLoginSuccess,
  isAdmin,
}: CommentListProps) {
  return (
    <div className="list">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
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
      ))}
    </div>
  );
}
