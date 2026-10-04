import hljs from "highlight.js/lib/common";
import { JSON_SCHEMA, loadAll } from "js-yaml";
import type { PlaybookPolicySkillResource } from "./types";

type PlaybookMarkdownPreview = {
  body: string;
  metadata: [string, string][];
  unparsedFrontmatter?: string;
};

export function parsePlaybookMarkdownFile(content: string): PlaybookMarkdownPreview {
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(content);
  if (match?.index !== 0) return { body: content, metadata: [] };
  const frontmatter = match[1];
  const body = content.slice(match[0].length);
  if (!frontmatter.trim()) return { body, metadata: [] };
  try {
    // Public file metadata is data only. Unsupported tags/aliases stay readable as source.
    const documents = loadAll(frontmatter, { schema: JSON_SCHEMA, maxAliases: 0, maxDepth: 32 });
    const parsed = documents[0];
    if (documents.length === 0 || parsed === null) return { body, metadata: [] };
    if (documents.length > 1) return { body, metadata: [], unparsedFrontmatter: frontmatter };
    if (typeof parsed !== "object" || Array.isArray(parsed))
      return { body, metadata: [], unparsedFrontmatter: frontmatter };
    return {
      body,
      metadata: Object.entries(parsed).map(([key, value]) => [
        key,
        typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value)),
      ]),
    };
  } catch {
    return { body, metadata: [], unparsedFrontmatter: frontmatter };
  }
}

export type PlaybookFileNode =
  | { name: string; path: string; children: PlaybookFileNode[]; index?: never }
  | { name: string; path: string; index: number; children?: never };

export function createPlaybookFileTree(files: PlaybookPolicySkillResource[]) {
  const root: PlaybookFileNode[] = [];
  files.forEach((file, index) => {
    let children = root;
    const parts = file.path.split("/");
    parts.forEach((name, depth) => {
      const path = parts.slice(0, depth + 1).join("/");
      if (depth === parts.length - 1) {
        children.push({ name, path, index });
      } else {
        let directory = children.find((node) => node.path === path && node.children);
        if (!directory) {
          directory = { name, path, children: [] };
          children.push(directory);
        }
        children = directory.children ?? children;
      }
    });
  });
  const sort = (nodes: PlaybookFileNode[]) => {
    nodes.sort(
      (a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name, "en")
    );
    for (const node of nodes) if (node.children) sort(node.children);
  };
  sort(root);
  return root;
}

const languages: Record<string, string> = {
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  conf: "ini",
  py: "python",
  rs: "rust",
  go: "go",
  css: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  c: "c",
  h: "c",
  cpp: "cpp",
  md: "markdown",
  markdown: "markdown",
  diff: "diff",
};

export function playbookFileLanguage(path: string) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const language = languages[name.split(".").at(-1) ?? ""];
  return language && hljs.getLanguage(language) ? language : "text";
}

export function highlightPlaybookFile(content: string, language: string) {
  if (language === "text" || !hljs.getLanguage(language)) return undefined;
  // highlight.js escapes the source before emitting its own span markup.
  return hljs.highlight(content, { language, ignoreIllegals: true }).value;
}

export function resolvePlaybookFileLink(
  path: string,
  url: string,
  files: PlaybookPolicySkillResource[]
) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/iu.test(url)) return undefined;
  const [pathname] = url.split(/[?#]/u);
  const segments = path.split("/").slice(0, -1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return undefined;
      segments.pop();
    } else segments.push(segment);
  }
  const index = files.findIndex((file) => file.path === segments.join("/"));
  return index < 0 ? undefined : index;
}
