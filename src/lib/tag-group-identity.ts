import type { TagGroup } from "@/types/tag-groups";

/** AI may organize canonical identities; it cannot rename or collapse them. */
export function resolveTagGroupIdentities(groups: TagGroup[], names: string[]): TagGroup[] {
  const normalize = (name: string) => name.trim().normalize("NFC");
  const lookup = new Map(names.map((name) => [normalize(name), name]));
  const seen = new Set<string>();
  const result = groups.map((group) => ({
    ...group,
    tags: group.tags.map((tag) => {
      const key = normalize(tag);
      const name = lookup.get(key);
      if (!name) throw new Error(`Tag not found in source list: ${tag}`);
      if (seen.has(key)) throw new Error(`Tag duplicated across groups: ${name}`);
      seen.add(key);
      return name;
    }),
  }));
  const missing = names.filter((name) => !seen.has(normalize(name)));
  if (missing.length) result.push({ key: "unassigned", title: "Unassigned", tags: missing });
  return result;
}
