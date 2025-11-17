import type { Metadata } from "next";
import { PersonalAccessTokenManager } from "@/components/admin/pats/PersonalAccessTokenManager";
import { ensureAdminOrInterrupt } from "@/lib/admin-gate";

export const metadata: Metadata = {
  title: "访问令牌管理 - 管理后台",
  description: "为用户创建、查看和管理个人访问令牌",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPersonalAccessTokensPage() {
  await ensureAdminOrInterrupt();
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-2 sm:px-6">
      <PersonalAccessTokenManager />
    </div>
  );
}
