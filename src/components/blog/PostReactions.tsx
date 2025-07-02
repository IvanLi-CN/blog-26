import { useUserInfo } from '../comments/hooks';
import ReactionsWithProvider from '../comments/ReactionsWithProvider';

interface PostReactionsProps {
  postSlug: string;
}

export default function PostReactions({ postSlug }: PostReactionsProps) {
  const { userInfo } = useUserInfo();

  return (
    <div className="flex items-center h-full">
      <ReactionsWithProvider targetType="post" targetId={postSlug} userInfo={userInfo} />
    </div>
  );
}
