import { useCallback, useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { getVisitorId } from '~/lib/fingerprint';
import type { UserInfo } from './types';

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

interface ReactionsProps {
  targetType: 'post' | 'comment';
  targetId: string;
  userInfo: UserInfo | null;
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🤔'];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Reactions({ targetType, targetId, userInfo }: ReactionsProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (!userInfo) {
      getVisitorId().then(setFingerprint);
    }
  }, [userInfo]);

  const canFetch = targetType && targetId && (userInfo || fingerprint);
  const swrKey = canFetch
    ? `/api/reactions?targetType=${targetType}&targetId=${targetId}&fingerprint=${fingerprint || ''}`
    : null;

  const { data, error, isLoading } = useSWR<{ reactions: Reaction[] }>(swrKey, fetcher);

  const handleEmojiClick = useCallback(
    async (emoji: string) => {
      if (!canFetch) return;

      const optimisticData = {
        reactions:
          data?.reactions.map((r) => {
            if (r.emoji === emoji) {
              return {
                ...r,
                count: r.userReacted ? r.count - 1 : r.count + 1,
                userReacted: !r.userReacted,
              };
            }
            return r;
          }) ?? [],
      };

      // If emoji doesn't exist yet, add it to optimistic data
      if (!optimisticData.reactions.some((r) => r.emoji === emoji)) {
        optimisticData.reactions.push({ emoji, count: 1, userReacted: true });
      }

      mutate(swrKey, optimisticData, false);

      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, emoji, fingerprint }),
      });

      if (res.ok) {
        // Re-fetch to get the final state from server
        mutate(swrKey);
      } else {
        // Revert on failure
        mutate(swrKey, data, false);
      }
    },
    [canFetch, targetType, targetId, fingerprint, data, mutate, swrKey]
  );

  const displayedReactions = data?.reactions.filter((r) => r.count > 0) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 mt-2">
        {EMOJI_OPTIONS.map((emoji) => (
          <div key={emoji} className="skeleton h-6 w-10 rounded-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-error text-xs mt-2">无法加载表情...</div>;
  }

  return (
    <div className="flex items-center gap-2">
      {EMOJI_OPTIONS.map((emoji) => {
        const reaction = displayedReactions.find((r) => r.emoji === emoji);
        const userReacted = reaction?.userReacted ?? false;
        return (
          <button
            key={emoji}
            onClick={() => handleEmojiClick(emoji)}
            className={`btn btn-xs rounded-full transition-all duration-200 ${
              userReacted ? 'btn-primary' : 'btn-ghost'
            }`}
            aria-label={`React with ${emoji}`}
          >
            <span className="text-sm">{emoji}</span>
            {reaction && reaction.count > 0 && <span className="text-xs ml-1">{reaction.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
