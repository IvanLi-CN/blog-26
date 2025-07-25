import { useEffect, useState } from 'react';
import { getVisitorId } from '~/lib/fingerprint';
import { trpc } from '~/lib/trpc-client';

interface MemoReactionStatsProps {
  memoSlug: string;
}

export default function MemoReactionStats({ memoSlug }: MemoReactionStatsProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    getVisitorId().then(setFingerprint);
  }, []);

  const canFetch = memoSlug && fingerprint;

  // 使用 tRPC 查询表情反应
  const { data, isLoading } = trpc.reactions.getReactions.useQuery(
    {
      targetType: 'post',
      targetId: memoSlug,
    },
    {
      enabled: !!canFetch,
      retry: false,
    }
  );

  // 只显示数量大于0的表情
  const displayedReactions = data?.reactions.filter((r) => r.count > 0) ?? [];

  if (isLoading || !canFetch) {
    return null;
  }

  if (displayedReactions.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {displayedReactions.map((reaction) => (
        <div key={reaction.emoji} className="flex items-center gap-1 px-2 py-1 bg-base-200 rounded-full text-xs">
          <span>{reaction.emoji}</span>
          <span className="text-base-content/60">{reaction.count}</span>
        </div>
      ))}
    </div>
  );
}
