export interface Author {
  id: string;
  nickname: string;
  avatarUrl: string;
}

export interface Comment {
  id: string;
  content: string;
  parentId: string | null;
  authorId: string; // 添加authorId字段用于权限判断
  status?: 'pending' | 'approved' | 'rejected'; // 可选，因为 tRPC 可能不返回这个字段
  createdAt: number;
  author: Author;
  replies: Comment[];
}

export interface UserInfo {
  id: string;
  nickname: string;
  email: string;
  avatarUrl: string;
  isAdmin?: boolean;
}
