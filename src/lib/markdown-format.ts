import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

export class MarkdownFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MarkdownFormatError";
  }
}

const markdownFormatter = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkStringify, {
    bullet: "-",
    fences: true,
    listItemIndent: "one",
    rule: "-",
    ruleRepetition: 3,
  });

function stashWikiLinks(markdown: string): { markdown: string; tokens: string[] } {
  const tokens: string[] = [];
  return {
    markdown: markdown.replace(/!?\[\[[^\]\n]+\]\]/g, (match) => {
      const token = `MCPWIKILINKTOKEN${tokens.length}MCP`;
      tokens.push(match);
      return token;
    }),
    tokens,
  };
}

function restoreWikiLinks(markdown: string, tokens: string[]): string {
  return markdown.replace(/MCPWIKILINKTOKEN(\d+)MCP/g, (_match, index: string) => {
    return tokens[Number(index)] ?? _match;
  });
}

export function formatMarkdownBody(markdown: string): string {
  if (markdown.includes("\0")) {
    throw new MarkdownFormatError("Markdown content contains a NUL byte and cannot be formatted.");
  }

  try {
    const normalized = markdown.replace(/\r\n?/g, "\n").trim();
    if (!normalized) return "\n";
    const stashed = stashWikiLinks(normalized);
    const file = markdownFormatter.processSync(stashed.markdown);
    const formatted = restoreWikiLinks(String(file).trim(), stashed.tokens);
    return `${formatted}\n`;
  } catch (error) {
    throw new MarkdownFormatError("Markdown content could not be formatted.", { cause: error });
  }
}
