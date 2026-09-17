export interface ProjectTocItem {
  depth: 2 | 3;
  text: string;
  slug: string;
}

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*~]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractProjectToc(source: string): ProjectTocItem[] {
  const headings: ProjectTocItem[] = [];
  const ids = new Map<string, number>();
  for (const match of source.matchAll(/^(#{2,3})\s+(.+?)\s*#*\s*$/gm)) {
    const depth = match[1].length as 2 | 3;
    const text = match[2].replace(/[`*~]/g, "").trim();
    const base = slugifyHeading(text) || `section-${headings.length + 1}`;
    const count = ids.get(base) ?? 0;
    ids.set(base, count + 1);
    headings.push({ depth, text, slug: count ? `${base}-${count + 1}` : base });
  }
  return headings.length >= 3 ? headings : [];
}
