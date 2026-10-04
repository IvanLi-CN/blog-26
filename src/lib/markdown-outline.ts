import type { Nodes, Root } from "mdast";
import { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { cleanMarkdownContent } from "@/components/common/markdown/utils";

export type MarkdownOutlineHeading = { id: string; title: string; depth: number };

function headingText(node: Nodes): string {
  if ("children" in node) return node.children.map(headingText).join("");
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  if (node.type === "html") return node.value.replace(/<[^>]*>/g, "");
  if ("value" in node) return node.value;
  return node.type === "break" ? " " : "";
}

function annotateHeadings(tree: Root, prefix: string): MarkdownOutlineHeading[] {
  const headings: MarkdownOutlineHeading[] = [];
  const used = new Set<string>();
  visit(tree, "heading", (node) => {
    const title = headingText(node).replace(/\s+/g, " ").trim();
    const slug =
      title
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "") || "heading";
    const base = `playbook-${prefix}-${slug}`;
    let anchor = base;
    let suffix = 2;
    while (used.has(anchor)) anchor = `${base}-${suffix++}`;
    used.add(anchor);
    node.data = {
      ...node.data,
      hProperties: { ...node.data?.hProperties, id: anchor },
    };
    // Match the renderer's sanitization rather than bypassing DOM-clobber protection.
    headings.push({
      id: `${defaultSchema.clobberPrefix ?? ""}${anchor}`,
      title,
      depth: node.depth,
    });
  });
  return headings;
}

export function remarkHeadingAnchors({ prefix }: { prefix: string }) {
  return (tree: Root) => {
    annotateHeadings(tree, prefix);
  };
}

const outlineParser = unified().use(remarkParse).use(remarkMath).use(remarkGfm);

export function getMarkdownOutline(content: string, prefix: string): MarkdownOutlineHeading[] {
  return annotateHeadings(outlineParser.parse(cleanMarkdownContent(content)), prefix);
}
