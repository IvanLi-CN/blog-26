import { readFileSync } from "node:fs";
import path from "node:path";
import { Glob } from "bun";
import ts from "typescript";

const ROOT = process.cwd();

const includeGlobs = [
  "apps/admin/**/*.tsx",
  "src/components/comments/**/*.tsx",
  "src/components/common/**/*.tsx",
  "src/components/memos/**/*.tsx",
  "src/components/ui/**/*.tsx",
  "site/components/**/*.tsx",
  "site/pages/**/*.tsx",
];

const excludeMatchers = ["src/components/admin/", "src/components/ui/Headline.tsx"];

const bannedPatterns: Array<{ label: string; regex: RegExp }> = [
  { label: "btn", regex: /(?:^|\s)btn(?:$|\s|-[^\s}]*)/ },
  {
    label: "card",
    regex: /(?:^|\s)card(?:$|\s|-(?:body|title|actions|side|compact|bordered|image-full))/,
  },
  { label: "badge", regex: /(?:^|\s)badge(?:$|\s|-[^\s}]*)/ },
  { label: "alert", regex: /(?:^|\s)alert(?:$|\s|-(?!triangle)[^\s}]*)/ },
  { label: "navbar", regex: /(?:^|\s)navbar(?:$|\s|-[^\s}]*)/ },
  { label: "dropdown", regex: /(?:^|\s)dropdown(?:$|\s|-[^\s}]*)/ },
  { label: "loading", regex: /(?:^|\s)loading(?:$|\s|-[^\s}]*)/ },
  { label: "modal-box", regex: /(?:^|\s)modal-(?:open|box|action|toggle)\b/ },
  { label: "tabs", regex: /(?:^|\s)tabs(?:$|\s|-[^\s}]*)/ },
  { label: "toggle", regex: /(?:^|\s)toggle(?:$|\s|-[^\s}]*)/ },
  { label: "checkbox", regex: /(?:^|\s)checkbox(?:$|\s|-[^\s}]*)/ },
  { label: "tooltip", regex: /(?:^|\s)tooltip(?:$|\s|-[^\s}]*)/ },
  { label: "label-text", regex: /\blabel-text(?:-alt)?\b/ },
  { label: "form-control", regex: /\bform-control\b/ },
  { label: "join-item", regex: /\bjoin-item\b/ },
  { label: "bg-base", regex: /(?:^|\s)bg-base-[\w-]+\b/ },
  { label: "text-base-content", regex: /(?:^|\s)text-base-content(?:\/[\d.]+)?\b/ },
  { label: "border-base", regex: /(?:^|\s)border-base-[\w-]+\b/ },
  { label: "divide-base", regex: /(?:^|\s)divide-base-[\w-]+\b/ },
];

function isExcluded(filePath: string) {
  return excludeMatchers.some((pattern) => filePath.includes(pattern));
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function getContext(source: string, index: number) {
  const start = Math.max(0, index - 40);
  const end = Math.min(source.length, index + 80);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

const CLASS_CALLS = new Set(["cn", "cva", "clsx", "twJoin", "twMerge"]);

function isClassAttribute(node: ts.Node) {
  return ts.isJsxAttribute(node) && (node.name.text === "className" || node.name.text === "class");
}

function isClassCall(node: ts.Node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  if (ts.isIdentifier(node.expression)) {
    return CLASS_CALLS.has(node.expression.text);
  }

  if (ts.isPropertyAccessExpression(node.expression)) {
    return CLASS_CALLS.has(node.expression.name.text);
  }

  return false;
}

function hasClassContext(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (isClassAttribute(current) || isClassCall(current)) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function collectClassStrings(source: string, filePath: string) {
  const candidates: Array<{ value: string; pos: number }> = [];
  const seen = new Set<number>();
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  function pushCandidate(value: string, pos: number) {
    if (seen.has(pos)) {
      return;
    }

    seen.add(pos);
    candidates.push({ value, pos });
  }

  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) && hasClassContext(node)) {
      pushCandidate(node.text, node.getStart(sourceFile));
    }

    if (ts.isTemplateExpression(node) && hasClassContext(node)) {
      const value = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(
        " "
      );
      pushCandidate(value, node.getStart(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return candidates;
}

async function collectFiles() {
  const found = new Set<string>();

  for (const pattern of includeGlobs) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({ cwd: ROOT, absolute: false })) {
      if (!isExcluded(file)) {
        found.add(file);
      }
    }
  }

  return Array.from(found).sort();
}

const files = await collectFiles();
const violations: Array<{ file: string; label: string; context: string }> = [];

for (const relativeFile of files) {
  const absoluteFile = path.join(ROOT, relativeFile);
  const source = readFileSync(absoluteFile, "utf8");
  const stripped = stripComments(source);
  const classStrings = collectClassStrings(stripped, relativeFile);

  for (const candidate of classStrings) {
    for (const pattern of bannedPatterns) {
      const match = pattern.regex.exec(candidate.value);
      if (match?.index !== undefined) {
        violations.push({
          file: relativeFile,
          label: pattern.label,
          context: getContext(candidate.value, match.index),
        });
        break;
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Shipped-surface DaisyUI guard failed. Remaining legacy tokens:");
  for (const violation of violations) {
    console.error(`- ${violation.file} [${violation.label}] ${violation.context}`);
  }
  process.exit(1);
}

console.log(`Shipped-surface DaisyUI guard passed for ${files.length} files.`);
