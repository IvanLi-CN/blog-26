"use client";

import CommentSection from "./CommentSection";

interface CommentSectionWithProviderProps {
  postSlug: string;
  title?: string;
}

export default function CommentSectionWithProvider({
  postSlug,
  title,
}: CommentSectionWithProviderProps) {
  return <CommentSection postSlug={postSlug} title={title} />;
}
