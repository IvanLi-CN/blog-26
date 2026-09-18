import GithubSlugger from "github-slugger";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface ProjectTocItem {
  depth: 2 | 3;
  text: string;
  slug: string;
}

export type ProjectDetailBodyState =
  | { kind: "mdx"; body: { Content: any; toc: ProjectTocItem[] } }
  | { kind: "catalog"; description: string; highlights: string[] };

export function resolveProjectDetailBody(
  body: { Content: any; toc: ProjectTocItem[] } | null,
  fallback: { description: string; highlights: string[] }
): ProjectDetailBodyState {
  return body ? { kind: "mdx", body } : { kind: "catalog", ...fallback };
}

export function resolveProjectBody(
  slug: string,
  compiledBodies: Record<string, { default: any }>,
  sourceBodies: Record<string, string>
) {
  const path = `../content/projects/${slug}.mdx`;
  const module = compiledBodies[path];
  const source = sourceBodies[path];
  if (!module || !source) return null;
  return { Content: module.default, toc: extractProjectToc(source) };
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
  const sourceWithoutFences = source.replace(
    /^\s{0,3}(`{3,}|~{3,})[\s\S]*?(?:^\s{0,3}\1\s*$|$)/gm,
    ""
  );
  for (const match of sourceWithoutFences.matchAll(
    /^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?\s*(?:(?:\/\/[^\n]*)|(?:\/\*[\s\S]*?\*\/))*\s*$/gm
  )) {
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

function stripFrontmatter(source: string) {
  return source.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, "");
}

type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  children?: MarkdownNode[];
};

function headingText(node: MarkdownNode) {
  const values: string[] = [];
  const collect = (child: MarkdownNode) => {
    if (child.type === "html") return;
    if (typeof child.value === "string") values.push(child.value);
    child.children?.forEach(collect);
  };
  node.children?.forEach(collect);
  return values.join("").trim();
}

export function extractProjectToc(source: string): ProjectTocItem[] {
  const headings: ProjectTocItem[] = [];
  const slugger = new GithubSlugger();
  const tree = unified().use(remarkParse).parse(stripFrontmatter(source)) as MarkdownNode;
  visit(tree, "heading", (node) => {
    const heading = node as MarkdownNode;
    if (heading.depth !== 2 && heading.depth !== 3) return;
    const text = headingText(heading);
    const slug = slugger.slug(text) || slugger.slug(`section-${headings.length + 1}`);
    headings.push({ depth: heading.depth, text, slug });
  });
  return headings.length >= 3 ? headings : [];
}
