import { useUserInfo } from '../comments/hooks';
import Reactions from '../comments/Reactions';

interface PostReactionsProps {
  postSlug: string;
}

export default function PostReactions({ postSlug }: PostReactionsProps) {
  const { userInfo } = useUserInfo();

  return (
    <div className="flex items-center h-full">
      <Reactions targetType="post" targetId={postSlug} userInfo={userInfo} />
    </div>
  );
}
