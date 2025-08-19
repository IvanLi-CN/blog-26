"use client";

import type { UserInfo } from "../comments/types";
import Reactions from "./Reactions";

interface ReactionsWithProviderProps {
  targetType: "post" | "comment";
  targetId: string;
  userInfo: UserInfo | null;
}

export default function ReactionsWithProvider(props: ReactionsWithProviderProps) {
  return <Reactions {...props} />;
}
