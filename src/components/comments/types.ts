export interface Author {
  id: string;
  nickname: string;
}

export interface Comment {
  id: string;
  content: string;
  parentId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  author: Author;
  replies: Comment[];
}

export interface UserInfo {
  id: string;
  nickname: string;
  email: string;
}
