/** Diagnostic observations, deliberately not product acceptance assertions. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { MarkdownRenderer } from "../../../src/components/common/MarkdownRenderer";
import { cleanMarkdownContent } from "../../../src/components/common/markdown/utils";
import { duplicateIds, inspectFootnoteReferences } from "../../helpers/assistant-markdown-contract";
import {
  codeCases,
  completeMarkdown,
  escapingAndCurrency,
  externalImages,
  footnoteInstances,
  maliciousHtml,
} from "./index";

function baselineBody(content: string): HTMLElement {
  const html = renderToStaticMarkup(
    createElement(MarkdownRenderer, {
      content,
      variant: "memo",
      surface: "public",
      enableMath: true,
      enableMermaid: false,
      nofollowExternalLinks: true,
    })
  );
  // JSDOM has no resources:usable or runScripts; this never fetches sample URLs.
  return new JSDOM(html).window.document.body;
}

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

export function probeAssistantMarkdownBaseline() {
  const observations: { id: string; scope: string; observed: unknown }[] = [];
  function observe(id: string, scope: string, inspect: () => unknown) {
    try {
      observations.push({ id, scope, observed: inspect() });
    } catch (error) {
      observations.push({
        id,
        scope,
        observed: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  observe("gfm-dom", "baseline MarkdownRenderer static DOM", () => {
    const body = baselineBody(completeMarkdown.message.content);
    return {
      heading: body.querySelector("h1")?.textContent,
      orderedStart: body.querySelector("ol")?.getAttribute("start"),
      disabledTasks: [...body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
        (input) => input.disabled
      ),
      linkTitle: [...body.querySelectorAll("a")]
        .find((node) => node.textContent === "标题链接")
        ?.getAttribute("title"),
      footnoteReferenceCount: body.querySelectorAll("a[data-footnote-ref]").length,
      footnoteEdges: inspectFootnoteReferences(body),
      nowrapCells: body.querySelectorAll("td.whitespace-nowrap").length,
    };
  });
  observe("code-dom", "baseline MarkdownRenderer static DOM", () =>
    codeCases.map((entry) => {
      try {
        const body = baselineBody(entry.content);
        const code = body.querySelector("pre code");
        return {
          id: entry.id,
          codeClass: code?.className ?? null,
          textMatchesParserDisplayValue:
            code?.textContent === (entry.source ? `${entry.source}\n` : ""),
          inlineStyleOnBlock: code?.className.includes("rounded-md") ?? false,
          copyButtons: [...body.querySelectorAll("button")].filter((button) =>
            /复制|copy/i.test(button.textContent ?? "")
          ).length,
          foldedInitially: !!body.querySelector(".collapsible-code-full.hidden"),
        };
      } catch (error) {
        return { id: entry.id, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );
  observe("raw-html-dom", "baseline MarkdownRenderer static DOM; no script execution", () => {
    const body = baselineBody(maliciousHtml.message.content);
    return {
      rawBoldElements: body.querySelectorAll("b").length,
      rawImageElements: body.querySelectorAll("img").length,
      iframeElements: body.querySelectorAll("iframe").length,
      scriptElements: body.querySelectorAll("script").length,
    };
  });
  observe("image-src", "static DOM only, not browser network evidence", () =>
    [...baselineBody(externalImages.message.content).querySelectorAll("img")].map((img) => ({
      alt: img.alt,
      src: img.getAttribute("src"),
    }))
  );
  observe("footnote-instances", "same answer rendered into three baseline instances", () => {
    const dom = new JSDOM(
      footnoteInstances.map((message) => baselineBody(message.content).innerHTML).join("")
    );
    return {
      referenceCount: dom.window.document.querySelectorAll("a[data-footnote-ref]").length,
      duplicateIds: duplicateIds(dom.window.document),
      isolationVerified: false,
    };
  });
  observe("math-dom", "baseline MarkdownRenderer static DOM; no layout measurement", () => {
    const body = baselineBody(escapingAndCurrency.message.content);
    return {
      formulas: body.querySelectorAll(".katex").length,
      displayFormulas: body.querySelectorAll(".katex-display").length,
      errorNodes: body.querySelectorAll(".katex-error").length,
      readableTail: body.textContent?.includes("旧 TeX 分隔符"),
    };
  });
  observe("source-rewrite", "direct production cleanMarkdownContent call", () => ({
    sourceChanged:
      cleanMarkdownContent(escapingAndCurrency.message.content) !==
      escapingAndCurrency.message.content,
    escapedEmphasis: cleanMarkdownContent(String.raw`\*literal\*`),
    htmlBreak: cleanMarkdownContent("a<br>b"),
  }));
  observe("parser-code-values", "locked upstream parser only, not product rendering", () =>
    codeCases.map((entry) => {
      const tree = unified().use(remarkParse).use(remarkMath).use(remarkGfm).parse(entry.content);
      const values: { language: string | null | undefined; value: string }[] = [];
      visit(tree, "code", (node) => {
        values.push({ language: node.lang, value: node.value });
      });
      return { id: entry.id, nodes: values };
    })
  );
  observe("entrypoints-source", "source indicators; not runtime lifecycle verification", () => ({
    unifiedUsesMarkdownRenderer: source("site/components/KnowledgeAssistant.tsx").includes(
      "<MarkdownRenderer"
    ),
    clippingUsesMarkdownRenderer: source("src/components/memos/ClippingDetail.tsx").includes(
      "<MarkdownRenderer"
    ),
    unifiedPollsSnapshots: source("site/components/KnowledgeAssistant.tsx").includes(
      "isGenerating(next) ? 650 : 2400"
    ),
  }));
  return { kind: "diagnostic-observations", acceptance: "not-evaluated", observations };
}

if (import.meta.main) {
  console.log(
    JSON.stringify(
      { probe: fileURLToPath(import.meta.url), ...probeAssistantMarkdownBaseline() },
      null,
      2
    )
  );
}
