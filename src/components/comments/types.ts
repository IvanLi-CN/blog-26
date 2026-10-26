export interface Author {
  id: string;
  nickname: string | null;
  avatarUrl: string;
  profileUrl?: string | null;
}

export interface Comment {
  id: string;
  content: string;
  parentId: string | null;
  authorEmail: string | null;
  status?: "pending" | "approved" | "rejected"; // 可选，因为 tRPC 可能不返回这个字段
  createdAt: number;
  author: Author;
  replies: Comment[];
  target?: { type: "article" | "memo" | "project"; key: string };
  rootId?: string | null;
  deleted?: boolean;
  authorRole?: "reader" | "admin";
  placeholder?: boolean;
  revision?: number;
  canDelete?: boolean;
  canModerate?: boolean;
  repliesNextCursor?: string | null;
}

export interface UserInfo {
  id: string;
  nickname: string;
  email: string | null;
  avatarUrl: string;
  isAdmin?: boolean;
  isAdminAuthor?: boolean;
  profileUrl?: string | null;
}
