import GithubSlugger from "github-slugger";

export interface ProjectTocItem {
  depth: 2 | 3;
  text: string;
  slug: string;
}

const allowedProjectContentBlocks = new Set([
  "ProjectCallout",
  "ProjectComparison",
  "ProjectFacts",
  "ProjectFigure",
]);

const allowedProjectContentBlockSources = new Set([
  "@/components/project-content-blocks",
  "../../../src/components/project-content-blocks",
]);

export function validateProjectMdxImports(source: string, filePath: string) {
  for (const match of source.matchAll(/^\s*import\s+(.+?)\s+from\s+["']([^"']+)["']\s*;?\s*$/gm)) {
    const [, specifiers, importedFrom] = match;
    if (!importedFrom.includes("/components/")) continue;

    if (!allowedProjectContentBlockSources.has(importedFrom)) {
      throw new Error(
        `Project MDX imports an unsupported site component: ${filePath} -> ${importedFrom}`
      );
    }

    const namedImport = specifiers.match(/^\{\s*([^}]*)\s*\}$/)?.[1];
    if (!namedImport) {
      throw new Error(`Project MDX content blocks must use named imports: ${filePath}`);
    }

    for (const importedName of namedImport.split(",")) {
      const name = importedName.split(/\s+as\s+/)[0]?.trim();
      if (name && !allowedProjectContentBlocks.has(name)) {
        throw new Error(`Project MDX imports an unsupported content block: ${filePath} -> ${name}`);
      }
    }
  }
}

export function extractProjectToc(source: string): ProjectTocItem[] {
  const headings: ProjectTocItem[] = [];
  const slugger = new GithubSlugger();
  let fence: { marker: string; length: number } | null = null;

  for (const line of source.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }

    const match = line.match(/^\s{0,3}(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const depth = match[1].length as 2 | 3;
    const text = match[2].replace(/[`*~]/g, "").trim();
    const slug = slugger.slug(text) || slugger.slug(`section-${headings.length + 1}`);
    headings.push({ depth, text, slug });
  }
  return headings.length >= 3 ? headings : [];
}
