import { headers } from "next/headers";
import { redirect } from "next/navigation";
import TagOrganizerPanel from "@/components/admin/TagOrganizerPanel";
import { getAdminEmail, getSsoEmailHeaderName } from "@/lib/admin-config";
import { isAdminFromRequest } from "@/lib/auth";
import { readTagGroupsConfig } from "@/server/services/tag-groups-config";
import { getTagSummaries } from "@/server/services/tag-service";

export const metadata = {
  title: "标签分组管理",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminTagOrganizerPage() {
  const headersList = await headers();
  const adminEmail = getAdminEmail();
  const emailHeaderName = getSsoEmailHeaderName();
  const remoteEmail = headersList.get(emailHeaderName);
  const isAdmin = await isAdminFromRequest(headersList);
  const headerSaysAdmin = Boolean(adminEmail && remoteEmail === adminEmail);
  if (!isAdmin && !headerSaysAdmin) {
    redirect("/admin-login");
  }

  const [config, summaries] = await Promise.all([
    readTagGroupsConfig(),
    getTagSummaries({ includeDrafts: true, includeUnpublished: true }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-base-content">标签分组管理</h1>
        <p className="text-sm text-base-content/70">
          使用 AI 辅助规划或手动调整标签分组。保存成功后将同步到公开站点配置。
        </p>
      </div>
      <TagOrganizerPanel
        initialGroups={config.groups}
        tagSummaries={summaries}
        initialModel={process.env.TAG_AI_MODEL || process.env.CHAT_COMPLETION_MODEL || undefined}
      />
    </div>
  );
}
