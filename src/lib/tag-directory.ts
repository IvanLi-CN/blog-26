import type { TagSummary } from "@/types/tags";

export type TagEntity = { type: "post" | "memo" | "project"; id: string; tags: string[] };

export function normalizeTagPath(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function normalizeTags(raw: unknown): string[] {
  let values: unknown[] = [];
  if (Array.isArray(raw)) values = raw;
  else if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : raw.split(",");
    } catch {
      values = raw.split(",");
    }
  }
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map(normalizeTagPath)
        .filter(Boolean)
    ),
  ];
}

export function matchesTag(path: string, tags: string[]): boolean {
  const canonical = normalizeTagPath(path);
  return (
    Boolean(canonical) &&
    tags.some((tag) => {
      const name = normalizeTagPath(tag);
      return name === canonical || name.startsWith(`${canonical}/`);
    })
  );
}

/** Entity identity, not the number of matching descendant assignments, owns each count. */
export function buildTagDirectory(entities: Iterable<TagEntity>): TagSummary[] {
  const directory = new Map<string, { summary: TagSummary; identities: Set<string> }>();
  for (const entity of entities) {
    for (const tag of normalizeTags(entity.tags)) {
      const segments = tag.split("/");
      for (let length = 1; length <= segments.length; length++) {
        const ancestors = segments.slice(0, length);
        const name = ancestors.join("/");
        let entry = directory.get(name);
        if (!entry) {
          entry = {
            summary: {
              name,
              segments: ancestors,
              lastSegment: ancestors[length - 1],
              count: 0,
              postCount: 0,
              memoCount: 0,
              projectCount: 0,
            },
            identities: new Set(),
          };
          directory.set(name, entry);
        }
        const identity = `${entity.type}:${entity.id}`;
        if (entry.identities.has(identity)) continue;
        entry.identities.add(identity);
        entry.summary[`${entity.type}Count`]++;
        entry.summary.count++;
      }
    }
  }
  const collator = new Intl.Collator("zh-Hans-CN", { sensitivity: "base" });
  return [...directory.values()]
    .map((entry) => entry.summary)
    .sort(
      (a, b) =>
        collator.compare(a.lastSegment, b.lastSegment) ||
        collator.compare(a.name, b.name) ||
        a.name.localeCompare(b.name)
    );
}
