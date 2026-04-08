"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getVisitorId } from "../../lib/fingerprint";
import type { UserInfo } from "../comments/types";

interface ReactionsProps {
  targetType: "post" | "comment";
  targetId: string;
  userInfo: UserInfo | null;
}

interface ReactionItem {
  emoji: string;
  count: number;
  userReacted?: boolean;
}

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "🎉", "🤔"];

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export default function Reactions({ targetType, targetId, userInfo }: ReactionsProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [items, setItems] = useState<ReactionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userInfo) {
      void getVisitorId()
        .then(setFingerprint)
        .catch(() => setFingerprint(null));
    }
  }, [userInfo]);

  const canFetch = useMemo(
    () => Boolean(targetType && targetId && (userInfo || fingerprint)),
    [fingerprint, targetId, targetType, userInfo]
  );

  const fetchReactions = useCallback(async () => {
    if (!canFetch) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await readJson<{ reactions: ReactionItem[] }>(
        `/api/public/reactions?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`
      );
      setItems(data.reactions ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [canFetch, targetId, targetType]);

  useEffect(() => {
    void fetchReactions();
  }, [fetchReactions]);

  const handleEmojiClick = useCallback(
    async (emoji: string) => {
      if (!canFetch) return;

      try {
        setIsLoading(true);
        await readJson(`/api/public/reactions/toggle`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetType, targetId, emoji }),
        });
        await fetchReactions();
      } catch (err) {
        console.error("Failed to toggle reaction:", err);
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    },
    [canFetch, fetchReactions, targetId, targetType]
  );

  return (
    <div className="flex items-center gap-2">
      {EMOJI_OPTIONS.map((emoji) => {
        const reaction = items.find((r) => r.emoji === emoji);
        const userReacted = reaction?.userReacted ?? false;
        const count = reaction?.count ?? 0;

        return (
          <button
            type="button"
            key={emoji}
            onClick={() => void handleEmojiClick(emoji)}
            disabled={isLoading}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all ${
              userReacted
                ? "border-[rgba(var(--nature-accent-rgb),0.45)] bg-[rgba(var(--nature-accent-rgb),0.14)] text-[color:var(--nature-accent-strong)]"
                : "border-[rgba(var(--nature-border-rgb),0.7)] bg-[rgba(var(--nature-surface-rgb),0.82)] text-[color:var(--nature-text-soft)] hover:border-[rgba(var(--nature-accent-rgb),0.4)] hover:text-[color:var(--nature-text)]"
            }`}
            aria-label={`React with ${emoji}`}
          >
            <span className="text-sm">{emoji}</span>
            {count > 0 && <span className="ml-1 text-xs">{count}</span>}
            {isLoading && <span className="nature-spinner h-3.5 w-3.5" />}
          </button>
        );
      })}
      {error && <div className="ml-2 text-xs text-[color:var(--nature-danger)]">加载失败</div>}
    </div>
  );
}
