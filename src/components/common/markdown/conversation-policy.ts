import type { Element, Root, RootContent } from "hast";
import rehypeKatex from "rehype-katex";
import { defaultSchema } from "rehype-sanitize";
import { visit } from "unist-util-visit";

/** Turn raw Markdown HTML into literal text before remark-rehype can create DOM nodes. */
export function remarkHtmlAsText() {
  return (tree: Root) => {
    visit(
      tree as never,
      "html",
      (node: { value?: unknown }, index, parent: { children: RootContent[] } | undefined) => {
        if (!parent || typeof index !== "number") return;
        const value = typeof node.value === "string" ? node.value : "";
        parent.children[index] = { type: "text", value } as RootContent;
      }
    );
  };
}

/** GFM may autolink the URL tail of an unfinished explicit link; keep that tail as text. */
export function remarkPreventPartialLinkAutolink() {
  return (tree: unknown, file: { toString: () => string }) => {
    const source = file.toString();
    const codeSpans: Array<{ start: number; end: number }> = [];
    visit(tree as never, "inlineCode", (node: any) => {
      if (node.position)
        codeSpans.push({ start: node.position.start.offset, end: node.position.end.offset });
    });
    const escaped = (offset: number) => {
      let count = 0;
      while (offset > 0 && source[--offset] === "\\") count++;
      return count % 2 === 1;
    };
    visit(tree as never, "link", (node: any, index, parent: any) => {
      const offset = node.position?.start?.offset;
      if (!parent || typeof index !== "number" || typeof offset !== "number") return;
      const prefix = source.slice(0, offset);
      const suffix = /\]\(\s*<?$/u.exec(prefix);
      if (!suffix || escaped(suffix.index) || escaped(suffix.index + 1)) return;
      let depth = 1;
      let opener = -1;
      for (
        let cursor = suffix.index - 1;
        cursor >= (parent.position?.start?.offset ?? 0);
        cursor--
      ) {
        const codeSpan = codeSpans.find((span) => cursor >= span.start && cursor < span.end);
        if (codeSpan) {
          cursor = codeSpan.start;
          continue;
        }
        if (escaped(cursor)) continue;
        if (source[cursor] === "]") depth++;
        if (source[cursor] === "[" && --depth === 0) {
          opener = cursor;
          break;
        }
      }
      if (opener < 0) return;
      const value = Array.isArray(node.children)
        ? node.children.map((child: { value?: unknown }) => String(child.value ?? "")).join("")
        : String(node.url ?? "");
      parent.children[index] = { type: "text", value };
    });
  };
}

/** Only remark-math nodes are formulas; an ordinary `math` fence remains copyable code. */
export function rehypeConversationMath() {
  const options = { throwOnError: false, trust: false };
  const renderMath = rehypeKatex(options);
  return (tree: Root, file: Parameters<typeof renderMath>[1]) => {
    const protectedCode: Array<{ node: Element; classes: Array<string | number> }> = [];
    visit(tree, "element", (node: Element) => {
      const classes = node.properties.className;
      if (
        node.tagName !== "code" ||
        !Array.isArray(classes) ||
        !classes.includes("language-math") ||
        classes.includes("math-inline") ||
        classes.includes("math-display")
      )
        return;
      protectedCode.push({ node, classes });
      node.properties.className = classes.filter((value) => value !== "language-math");
    });
    try {
      renderMath(tree, file);
    } finally {
      for (const { node, classes } of protectedCode) node.properties.className = classes;
    }
  };
}

function identityPart(value: string): string {
  const codePoints = Array.from(value, (character) => character.codePointAt(0) ?? 0);
  return codePoints.length
    ? codePoints.map((codePoint) => codePoint.toString(16)).join("-")
    : "empty";
}

function isFootnoteId(value: string): boolean {
  return value === "footnote-label" || value.startsWith("user-content-fn");
}

function rewriteId(value: string, prefix: string): string {
  return isFootnoteId(value) ? `${prefix}${value}` : value;
}

function rewriteReference(value: string, prefix: string): string {
  return value
    .split(/(\s+)/u)
    .map((part) => (isFootnoteId(part) ? `${prefix}${part}` : part))
    .join("");
}

/** Keep each parser-created footnote graph inside one message/presentation instance. */
export function rehypeNamespaceConversationFootnotes(messageId: string, presentationId: string) {
  const prefix = `amr-${identityPart(presentationId)}-${identityPart(messageId)}-`;
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const properties = (node.properties ?? {}) as Record<string, unknown>;
      if (typeof properties.id === "string") properties.id = rewriteId(properties.id, prefix);
      if (typeof properties.href === "string" && properties.href.startsWith("#")) {
        properties.href = `#${rewriteId(properties.href.slice(1), prefix)}`;
      }
      for (const key of ["ariaDescribedBy", "ariaLabelledBy"] as const) {
        const value = properties[key];
        if (Array.isArray(value))
          properties[key] = value.map((item) => rewriteReference(String(item), prefix));
        else if (typeof value === "string") properties[key] = rewriteReference(value, prefix);
      }
    });
  };
}

function safeHref(value: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject browser URL normalization before navigation.
  if (!value || value !== value.trim() || /[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  if (
    value.startsWith("#") ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../")
  ) {
    if (value.startsWith("//")) {
      try {
        const url = new URL(`https:${value}`);
        return Boolean(url.hostname) && !url.username && !url.password;
      } catch {
        return false;
      }
    }
    return true;
  }
  // Standard Markdown permits colons after the first path segment and inside query values.
  // Only a colon before the first slash/query/hash is treated as a scheme candidate.
  if (!/^[^/?#]*:/u.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:" ||
      url.protocol === "tel:"
    );
  } catch {
    return false;
  }
}

export function conversationUrlTransform(value: string, key: string): string | null {
  // Images remain subject to ConversationImage's exact-source authorization and protocol gate.
  if (key === "src") return safeHref(value) ? value : null;
  return safeHref(value) ? value : null;
}

export function isConversationExternalHref(value: string | undefined): boolean {
  if (!value) return false;
  if (value.startsWith("//")) {
    try {
      const url = new URL(`https:${value}`);
      return Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** The article renderer keeps its existing schema and pipeline; this is chat's narrower schema. */
export const conversationSanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "section",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [
      "href",
      "title",
      "id",
      "ariaDescribedBy",
      "ariaLabelledBy",
      "dataFootnoteRef",
      "dataFootnoteBackref",
      "ariaLabel",
      "className",
    ],
    code: ["className"],
    h1: ["id", "className"],
    h2: ["id", "className"],
    h3: ["id", "className"],
    h4: ["id", "className"],
    h5: ["id", "className"],
    h6: ["id", "className"],
    img: ["src", "alt", "title", "className"],
    input: ["type", "checked", "disabled"],
    li: ["id", "className"],
    ol: ["start", "className"],
    section: ["className", "dataFootnotes"],
    table: ["className"],
    tbody: ["className"],
    td: ["align", "className", "colspan", "rowspan"],
    tfoot: ["className"],
    th: ["align", "className", "colspan", "rowspan"],
    thead: ["className"],
    tr: ["className"],
    ul: ["className"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https"],
  },
};
