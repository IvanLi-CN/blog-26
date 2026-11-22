import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Markdown/YAML highlighting that reads from the admin theme variables. */
const adminHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--editor-heading, var(--foreground))", fontWeight: "700" },
  { tag: tags.heading2, color: "var(--editor-heading, var(--foreground))", fontWeight: "650" },
  { tag: tags.heading, color: "var(--editor-heading, var(--foreground))", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--editor-link, var(--primary))", textDecoration: "underline" },
  { tag: tags.url, color: "var(--editor-link, var(--primary))" },
  { tag: tags.monospace, color: "var(--editor-inline-code, var(--warning))" },
  { tag: tags.keyword, color: "var(--editor-code-keyword, var(--primary))" },
  { tag: tags.string, color: "var(--editor-code-string, var(--secondary))" },
  { tag: tags.number, color: "var(--editor-code-number, var(--secondary))" },
  {
    tag: tags.comment,
    color: "var(--editor-code-comment, var(--muted-foreground))",
    fontStyle: "italic",
  },
  { tag: tags.propertyName, color: "var(--editor-text-soft, var(--foreground))" },
  { tag: tags.atom, color: "var(--editor-code-literal, var(--warning))" },
  { tag: tags.meta, color: "var(--editor-code-meta, var(--muted-foreground))" },
]);

/** Markdown document with YAML frontmatter parsed by the YAML grammar. */
export function contentLanguageExtension() {
  return [
    markdown({
      base: markdownLanguage,
      extensions: [{ ...yaml(), name: "yaml" }],
    }),
    syntaxHighlighting(adminHighlightStyle),
  ];
}
