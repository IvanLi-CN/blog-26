export type TagSummary = {
  name: string;
  segments: string[];
  lastSegment: string;
  count: number;
  postCount: number;
  memoCount: number;
  projectCount: number;
};

export type TaggedPost = {
  title: string;
  slug: string;
  excerpt: string | null;
  tags: string[];
};
