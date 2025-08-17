"use client";

import Reactions from './Reactions';
import type { UserInfo } from '../comments/types';

interface ReactionsWithProviderProps {
  targetType: 'post' | 'comment';
  targetId: string;
  userInfo: UserInfo | null;
}

export default function ReactionsWithProvider(props: ReactionsWithProviderProps) {
  return <Reactions {...props} />;
}
