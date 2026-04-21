"use client";

import CommentSection from "./CommentSection";

interface CommentSectionWithProviderProps {
  postSlug: string;
  title?: string;
  usePublicSitePaths?: boolean;
}

export default function CommentSectionWithProvider({
  postSlug,
  title,
  usePublicSitePaths = false,
}: CommentSectionWithProviderProps) {
  return (
    <CommentSection postSlug={postSlug} title={title} usePublicSitePaths={usePublicSitePaths} />
  );
}
