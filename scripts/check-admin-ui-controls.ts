import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import { Glob } from "bun";

const ROOT = process.cwd();
const ADMIN_ROOT = "apps/admin/src/";
const UI_IMPLEMENTATION = "apps/admin/src/components/ui.tsx";
const NATIVE_CONTROLS = new Set(["button", "input", "select", "textarea", "details", "summary"]);
const INTERACTION_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "dialog",
  "listbox",
  "menu",
  "menuitem",
  "option",
  "radio",
  "switch",
  "tab",
  "tablist",
]);

export type AdminUiControlViolation = {
  file: string;
  line: number;
  column: number;
  message: string;
};

type AstNode = {
  type: string;
  start?: number | null;
  loc?: { start?: { line?: number; column?: number } } | null;
  [key: string]: unknown;
};

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}

function getAstNode(value: unknown): AstNode | undefined {
  return isAstNode(value) ? value : undefined;
}

function getStringProperty(node: AstNode | undefined, property: string): string | undefined {
  const value = node?.[property];
  return typeof value === "string" ? value : undefined;
}

function isUiImplementation(filePath: string) {
  return filePath.replaceAll(path.sep, "/").endsWith(UI_IMPLEMENTATION);
}

function isProductionFile(filePath: string) {
  const normalized = filePath.replaceAll(path.sep, "/");
  return (
    normalized.startsWith(ADMIN_ROOT) &&
    !/(\.test|\.spec)\.[jt]sx?$/.test(normalized) &&
    !/\.stories\.[jt]sx?$/.test(normalized)
  );
}

function getLocation(node: AstNode) {
  return {
    line: node.loc?.start?.line ?? 1,
    column: (node.loc?.start?.column ?? 0) + 1,
  };
}

function getJsxName(node: AstNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "JSXIdentifier") return getStringProperty(node, "name");
  return undefined;
}

function getAttributeStringValue(node: AstNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "StringLiteral") return getStringProperty(node, "value");
  if (node.type !== "JSXExpressionContainer") return undefined;
  const expression = getAstNode(node.expression);
  return expression?.type === "StringLiteral" ? getStringProperty(expression, "value") : undefined;
}

function getImportSource(node: AstNode) {
  const source = getAstNode(node.source);
  return source ? getStringProperty(source, "value") : undefined;
}

export function scanSource(source: string, filePath: string): AdminUiControlViolation[] {
  if (!isProductionFile(filePath) || isUiImplementation(filePath)) return [];

  const ast = parse(source, {
    sourceFilename: filePath,
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  }) as unknown as AstNode;
  const violations: AdminUiControlViolation[] = [];
  const seen = new WeakSet<object>();

  function add(node: AstNode, message: string) {
    const location = getLocation(node);
    violations.push({ file: filePath, ...location, message });
  }

  function visit(node: AstNode) {
    if (seen.has(node)) return;
    seen.add(node);

    if (node.type === "JSXElement") {
      const opening = getAstNode(node.openingElement);
      const name = getJsxName(opening ? getAstNode(opening.name) : undefined);
      if (name && NATIVE_CONTROLS.has(name)) {
        add(node, `<${name}> must come from the local admin UI library`);
      }

      const attributes = opening ? opening.attributes : undefined;
      if (Array.isArray(attributes)) {
        for (const attributeValue of attributes) {
          const attribute = getAstNode(attributeValue);
          if (attribute?.type !== "JSXAttribute") continue;
          const attributeName = getJsxName(getAstNode(attribute.name));
          if (attributeName !== "role") continue;
          const role = getAttributeStringValue(getAstNode(attribute.value))?.toLowerCase();
          if (role && INTERACTION_ROLES.has(role)) {
            add(node, `role="${role}" must be provided by the local admin UI library`);
          }
        }
      }
    }

    if (
      node.type === "ImportDeclaration" ||
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration"
    ) {
      const sourceName = getImportSource(node);
      if (sourceName && (sourceName.startsWith("@radix-ui/") || sourceName === "vaul")) {
        add(node, `direct import of ${sourceName} is restricted to ${UI_IMPLEMENTATION}`);
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (isAstNode(child)) visit(child);
        }
      } else if (isAstNode(value)) {
        visit(value);
      }
    }
  }

  visit(ast);
  return violations;
}

async function collectFiles() {
  const files: string[] = [];
  const glob = new Glob(`${ADMIN_ROOT}**/*.{ts,tsx}`);
  for await (const file of glob.scan({ cwd: ROOT, absolute: false })) files.push(file);
  return files.sort();
}

async function main() {
  const files = await collectFiles();
  const violations: AdminUiControlViolation[] = [];
  for (const relativeFile of files) {
    const source = readFileSync(path.join(ROOT, relativeFile), "utf8");
    violations.push(...scanSource(source, relativeFile));
  }

  if (violations.length > 0) {
    console.error("Admin UI boundary check failed:");
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line}:${violation.column} ${violation.message}`
      );
    }
    process.exit(1);
  }

  console.log(`Admin UI boundary check passed for ${files.length} files.`);
}

if (import.meta.main) await main();
