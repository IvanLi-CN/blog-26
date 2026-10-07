import type { Element, Root } from "hast";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SITE } from "@/config/site";

/** RSS stores HTML; clip links receive the same policy as the interactive reader. */
export function renderClippingFeed(content: string, targetUrl: string | null) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(() => (root: Root) => {
      if (targetUrl && /^https?:\/\//i.test(targetUrl))
        root.children.push({
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "a",
              properties: { href: targetUrl },
              children: [{ type: "text", value: "打开原网页 ↗" }],
            },
          ],
        });
      const visit = (node: Root | Element) => {
        if (
          node.type === "element" &&
          node.tagName === "a" &&
          typeof node.properties.href === "string"
        ) {
          try {
            const url = new URL(node.properties.href, SITE.url);
            if (/^https?:$/.test(url.protocol) && url.origin !== new URL(SITE.url).origin) {
              node.properties.rel = ["nofollow", "noopener", "noreferrer"];
              node.properties.target = "_blank";
            }
          } catch {
            /* Sanitization already rejects unsafe schemes. */
          }
        }
        for (const child of node.children) if (child.type === "element") visit(child);
      };
      visit(root);
    })
    .use(rehypeStringify);
  return String(processor.processSync(content));
}
