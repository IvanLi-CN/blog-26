import { ensureAdminOrInterrupt } from "@/lib/admin-gate";
import { readTagGroupsFromDB } from "@/server/services/tag-groups";
import { getAllCategoryIcons, getAllTagIcons } from "@/server/services/tag-icons";
import { getTagSummaries } from "@/server/services/tag-service";
import TagIconManagerClient from "./TagIconManagerClient";

export const dynamic = "force-dynamic";

export default async function TagIconsAdminPage() {
  await ensureAdminOrInterrupt();
  const [groupsCfg, summaries, tagIcons, catIcons] = await Promise.all([
    readTagGroupsFromDB(),
    getTagSummaries({ includeDrafts: false, includeUnpublished: false }),
    getAllTagIcons(),
    getAllCategoryIcons(),
  ]);

  // Build tag -> group map
  const tagToGroup = new Map<string, { key: string; title: string }>();
  for (const g of groupsCfg.groups)
    for (const t of g.tags) tagToGroup.set(t, { key: g.key, title: g.title });

  const grouped = new Map<
    string,
    {
      key: string;
      title: string;
      tags: Array<{ name: string; lastSegment: string; count: number }>;
    }
  >();
  function ensure(key: string, title: string) {
    let rec = grouped.get(key);
    if (!rec) {
      rec = { key, title, tags: [] as Array<{ name: string; lastSegment: string; count: number }> };
      grouped.set(key, rec);
    }
    return rec;
  }
  for (const tag of summaries) {
    const grp = tagToGroup.get(tag.name);
    const rec = grp ? ensure(grp.key, grp.title) : ensure("other", "Other");
    rec.tags.push({ name: tag.name, lastSegment: tag.lastSegment, count: tag.count });
  }
  const ordered = [
    ...groupsCfg.groups
      .map((g) => ({ key: g.key, title: g.title, tags: grouped.get(g.key)?.tags ?? [] }))
      .filter((g) => g.tags.length > 0),
  ];
  if (grouped.has("other") && (grouped.get("other")?.tags.length ?? 0) > 0) {
    ordered.push({ key: "other", title: "Other", tags: grouped.get("other")?.tags ?? [] });
  }

  return (
    <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">标签与分类图标匹配</h1>
        <p className="mt-2 text-base-content/70 text-sm">
          按分类显示，点击右侧箭头生成并查看图标候选；支持同时打开多个面板进行批量操作。
        </p>
      </div>
      <TagIconManagerClient groups={ordered} iconsMap={tagIcons} categoryIcons={catIcons} />
    </section>
  );
}
