"use client";

import CommentSection from "./CommentSection";

interface CommentSectionWithProviderProps {
  postSlug: string;
  target: { type: "article" | "memo" | "project"; key: string };
  title?: string;
  usePublicSitePaths?: boolean;
  embedded?: boolean;
  allowCompose?: boolean;
}

export default function CommentSectionWithProvider({
  postSlug,
  target,
  title,
  usePublicSitePaths = false,
  embedded = false,
  allowCompose = true,
}: CommentSectionWithProviderProps) {
  return (
    <CommentSection
      postSlug={postSlug}
      target={target}
      title={title}
      usePublicSitePaths={usePublicSitePaths}
      embedded={embedded}
      allowCompose={allowCompose}
    />
  );
}
