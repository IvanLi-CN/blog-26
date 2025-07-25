import { useUserInfo } from '../comments/hooks';
import ReactionsWithProvider from '../comments/ReactionsWithProvider';

interface MemoReactionsProps {
  memoSlug: string;
}

export default function MemoReactions({ memoSlug }: MemoReactionsProps) {
  const { userInfo } = useUserInfo();

  return (
    <div className="flex items-center">
      <ReactionsWithProvider targetType="post" targetId={memoSlug} userInfo={userInfo} />
    </div>
  );
}
