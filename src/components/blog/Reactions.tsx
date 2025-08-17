"use client";

import { useCallback, useEffect, useState } from 'react';
import { getVisitorId } from '../../lib/fingerprint';
import { trpc } from '../../lib/trpc';
import type { UserInfo } from '../comments/types';

interface ReactionsProps {
  targetType: 'post' | 'comment';
  targetId: string;
  userInfo: UserInfo | null;
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🤔'];

export default function Reactions({ targetType, targetId, userInfo }: ReactionsProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    if (!userInfo) {
      getVisitorId().then(setFingerprint);
    }
  }, [userInfo]);

  const canFetch = targetType && targetId && (userInfo || fingerprint);

  // 使用 tRPC 查询
  const { data, error, isLoading, refetch } = trpc.reactions.getReactions.useQuery(
    {
      targetType,
      targetId,
    },
    {
      enabled: !!canFetch,
      retry: false,
    }
  );

  // 使用 tRPC mutation
  const toggleReaction = trpc.reactions.toggle.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleEmojiClick = useCallback(
    async (emoji: string) => {
      if (!canFetch) return;

      try {
        await toggleReaction.mutateAsync({
          targetType,
          targetId,
          emoji,
        });
      } catch (error) {
        console.error('Failed to toggle reaction:', error);
      }
    },
    [canFetch, targetType, targetId, fingerprint, toggleReaction]
  );

  const displayedReactions = data?.reactions ?? [];

  return (
    <div className="flex items-center gap-2">
      {EMOJI_OPTIONS.map((emoji) => {
        const reaction = displayedReactions.find((r) => r.emoji === emoji);
        const userReacted = reaction?.userReacted ?? false;
        const count = reaction?.count ?? 0;

        return (
          <button
            key={emoji}
            onClick={() => handleEmojiClick(emoji)}
            disabled={isLoading}
            className={`btn btn-xs rounded-full transition-all duration-200 ${
              userReacted ? 'btn-primary' : 'btn-ghost'
            } ${isLoading ? 'loading' : ''}`}
            aria-label={`React with ${emoji}`}
          >
            <span className="text-sm">{emoji}</span>
            {count > 0 && <span className="text-xs ml-1">{count}</span>}
          </button>
        );
      })}
      {error && <div className="text-error text-xs ml-2">加载失败</div>}
    </div>
  );
}
