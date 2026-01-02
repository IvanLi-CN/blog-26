import { fetchIconifySsrSvgs } from "@/server/services/iconify-fetch";
import { resolveTagIconsForTags } from "@/server/services/tag-icon-resolver";

export const TAG_ICON_HASH_FALLBACK = "tabler:hash";

export type TagIconMap = Record<string, string | null>;

export type IconSvgMap = Record<string, string | null>;

export type ResolveTagIconSvgsResult = {
  iconMap: TagIconMap;
  svgMap: IconSvgMap;
};

export async function resolveTagIconSvgsForTags(
  tags: string[],
  options: {
    svgHeight?: string;
    includeHashFallback?: boolean;
  } = {}
): Promise<ResolveTagIconSvgsResult> {
  const iconMap = await resolveTagIconsForTags(tags);

  const iconIds = new Set<string>();
  for (const iconId of Object.values(iconMap)) {
    if (typeof iconId === "string" && iconId.trim().length > 0) {
      iconIds.add(iconId);
    }
  }

  const includeHashFallback =
    options.includeHashFallback ?? (tags.length > 0 && Object.keys(iconMap).length > 0);
  if (includeHashFallback) {
    iconIds.add(TAG_ICON_HASH_FALLBACK);
  }

  const svgMap =
    iconIds.size > 0
      ? await fetchIconifySsrSvgs(Array.from(iconIds), { svgHeight: options.svgHeight ?? "12" })
      : {};

  return { iconMap, svgMap };
}
