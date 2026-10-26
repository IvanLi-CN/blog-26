"use client";

import { useState } from "react";

export const DEFAULT_COMMENT_AVATAR = "/site-assets/default-avatar.svg";

interface CommentAvatarProps {
  avatarUrl?: string | null;
  alt: string;
  className?: string;
  width: number;
  height: number;
}

function normalizeAvatarUrl(avatarUrl?: string | null) {
  return avatarUrl?.trim() || DEFAULT_COMMENT_AVATAR;
}

export default function CommentAvatar({
  avatarUrl,
  alt,
  className,
  width,
  height,
}: CommentAvatarProps) {
  const normalizedAvatarUrl = normalizeAvatarUrl(avatarUrl);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const resolvedAvatarUrl =
    normalizedAvatarUrl === DEFAULT_COMMENT_AVATAR || failedAvatarUrl === normalizedAvatarUrl
      ? DEFAULT_COMMENT_AVATAR
      : normalizedAvatarUrl;

  return (
    // biome-ignore lint/performance/noImgElement: comment avatars need native load failure fallback
    <img
      src={resolvedAvatarUrl}
      alt={alt}
      className={className}
      width={width}
      height={height}
      onError={() => {
        if (normalizedAvatarUrl !== DEFAULT_COMMENT_AVATAR) setFailedAvatarUrl(normalizedAvatarUrl);
      }}
    />
  );
}
