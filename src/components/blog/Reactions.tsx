"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import { subscribeWebDemoRequestChanges } from "@/lib/web-demo-runtime";
import { getVisitorId } from "../../lib/fingerprint";
import { toPublicApiUrl } from "../../lib/public-runtime-url";
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
  const response = await webDemoFetch(input, {
    credentials: "include",
    ...init,
  });
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
  const requestVersion = useRef(0);
  const requestController = useRef<AbortController | null>(null);

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
    const version = ++requestVersion.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const data = await readJson<{ reactions: ReactionItem[] }>(
        toPublicApiUrl(
          `/api/public/reactions?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`
        ),
        { signal: controller.signal }
      );
      if (version !== requestVersion.current) return;
      setItems(data.reactions ?? []);
    } catch (err: unknown) {
      if (version !== requestVersion.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (version === requestVersion.current) {
        requestController.current = null;
        setIsLoading(false);
      }
    }
  }, [canFetch, targetId, targetType]);

  useEffect(() => {
    void fetchReactions();
    const unsubscribe = subscribeWebDemoRequestChanges(() => void fetchReactions());
    return () => {
      requestVersion.current += 1;
      requestController.current?.abort();
      requestController.current = null;
      unsubscribe();
    };
  }, [fetchReactions]);

  const handleEmojiClick = useCallback(
    async (emoji: string) => {
      if (!canFetch) return;
      const version = ++requestVersion.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      try {
        setIsLoading(true);
        setError(null);
        await readJson(toPublicApiUrl("/api/public/reactions/toggle"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetType, targetId, emoji }),
          signal: controller.signal,
        });
        if (version !== requestVersion.current) return;
        await fetchReactions();
      } catch (err) {
        if (version !== requestVersion.current) return;
        console.error("Failed to toggle reaction:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (version === requestVersion.current) {
          requestController.current = null;
          setIsLoading(false);
        }
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
            className={`nature-text-action inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all ${
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
