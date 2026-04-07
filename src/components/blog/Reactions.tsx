"use client";

import { useCallback, useEffect, useState } from "react";
import { getVisitorId } from "../../lib/fingerprint";
import { trpc } from "../../lib/trpc";
import type { UserInfo } from "../comments/types";

interface ReactionsProps {
  targetType: "post" | "comment";
  targetId: string;
  userInfo: UserInfo | null;
}

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "🎉", "🤔"];

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
        console.error("Failed to toggle reaction:", error);
      }
    },
    [canFetch, targetType, targetId, toggleReaction]
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
            type="button"
            key={emoji}
            onClick={() => handleEmojiClick(emoji)}
            disabled={isLoading}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all ${
              userReacted
                ? "border-[rgba(var(--nature-accent-rgb),0.45)] bg-[rgba(var(--nature-accent-rgb),0.14)] text-[color:var(--nature-accent-strong)]"
                : "border-[rgba(var(--nature-border-rgb),0.7)] bg-[rgba(var(--nature-surface-rgb),0.82)] text-[color:var(--nature-text-soft)] hover:border-[rgba(var(--nature-accent-rgb),0.4)] hover:text-[color:var(--nature-text)]"
            }`}
            aria-label={`React with ${emoji}`}
          >
            <span className="text-sm">{emoji}</span>
            {count > 0 && <span className="text-xs ml-1">{count}</span>}
            {isLoading && <span className="nature-spinner h-3.5 w-3.5" />}
          </button>
        );
      })}
      {error && <div className="ml-2 text-xs text-[color:var(--nature-danger)]">加载失败</div>}
    </div>
  );
}
