import {
  extractProjectToc,
  type ProjectTocItem,
  validateProjectMdxImports,
} from "./project-content-utils";

export type { ProjectTocItem } from "./project-content-utils";

const sourceBodies = import.meta.glob<string>("../content/projects/*.mdx", {
  eager: true,
  query: "?raw",
  import: "default",
});

function frontmatterSlug(source: string) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---/);
  const slug = match?.[1].match(/^slug:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
  return slug;
}

function validateBodies() {
  for (const [path, source] of Object.entries(sourceBodies)) {
    const fileSlug = path
      .split("/")
      .pop()
      ?.replace(/\.mdx$/, "");
    const declaredSlug = frontmatterSlug(source);
    if (!declaredSlug || declaredSlug !== fileSlug) {
      throw new Error(
        `Project MDX slug mismatch: ${path} declares ${declaredSlug ?? "missing slug"}`
      );
    }
    validateProjectMdxImports(source, path);
  }
}

validateBodies();

export function getProjectContentMetadata(slug: string): { toc: ProjectTocItem[] } | null {
  const source = sourceBodies[`../content/projects/${slug}.mdx`];
  return source ? { toc: extractProjectToc(source) } : null;
}
