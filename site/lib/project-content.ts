import { extractProjectToc, type ProjectTocItem } from "./project-content-utils";

export type { ProjectTocItem } from "./project-content-utils";

export interface ProjectBody {
  Content: any;
  toc: ProjectTocItem[];
}

type MdxModule = { default: any };

const compiledBodies = import.meta.glob<MdxModule>("../content/projects/*.mdx", {
  eager: true,
});
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
    if (!compiledBodies[path]) {
      throw new Error(`Project MDX source was not compiled: ${path}`);
    }
  }
}

validateBodies();

export function getProjectBody(slug: string): ProjectBody | null {
  const path = `../content/projects/${slug}.mdx`;
  const module = compiledBodies[path];
  const source = sourceBodies[path];
  if (!module || !source) return null;
  return { Content: module.default, toc: extractProjectToc(source) };
}
