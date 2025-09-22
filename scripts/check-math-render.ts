#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { cleanMarkdownContent } from "../src/components/common/markdown/utils";

async function main() {
  const file = join(process.cwd(), "dev-data/local/blog/usb-pd-protocol-and-dc-dc-feedback.md");
  const raw = await readFile(file, "utf-8");
  const cleaned = cleanMarkdownContent(raw);

  const html = String(
    await unified()
      .use(remarkParse)
      .use(remarkMath) // math first
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeKatex, { strict: "ignore", throwOnError: false })
      .use(rehypeStringify)
      .process(cleaned)
  );

  const hasKatex = html.includes('class="katex"') || html.includes('class="katex-display"');
  const snippetIndex = html.indexOf("V(t)");
  console.log("Has KaTeX:", hasKatex);
  console.log(
    "Snippet around V(t):",
    snippetIndex >= 0 ? html.slice(snippetIndex - 40, snippetIndex + 120) : "<not found>"
  );
  console.log("First 500 chars of HTML:\n", html.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
