import { readFileSync } from "node:fs";
import path from "node:path";
import { Glob } from "bun";

const ROOT = process.cwd();
const ADMIN_ROOT = "apps/admin/src/";
const THEME_FILE = "apps/admin/src/styles.css";

/**
 * Semantic color names the admin UI is allowed to reference. A name that is used
 * as a Tailwind color utility but missing from the `@theme inline` block renders
 * as unstyled text, which silently removes the visual error signal.
 */
const SEMANTIC_COLOR_NAMES: Record<string, true> = {
  primary: true,
  secondary: true,
  accent: true,
  muted: true,
  card: true,
  popover: true,
  background: true,
  foreground: true,
  destructive: true,
  success: true,
  warning: true,
  error: true,
  danger: true,
  info: true,
  border: true,
  input: true,
  ring: true,
  scrim: true,
};

const COLOR_UTILITY =
  /\b(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|placeholder|shadow)-([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)(?:\/[\w.[\]%()-]+)?/g;

export type SemanticTokenViolation = {
  file: string;
  line: number;
  token: string;
  message: string;
};

export function readDefinedColorTokens(css: string) {
  const tokens = new Set<string>();
  const block = css.match(/@theme\s+inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  for (const match of block.matchAll(/--color-([a-z0-9-]+)\s*:/g)) tokens.add(match[1]);
  return tokens;
}

export function scanSource(
  source: string,
  filePath: string,
  defined: Set<string>
): SemanticTokenViolation[] {
  const violations: SemanticTokenViolation[] = [];
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(COLOR_UTILITY)) {
      const token = match[1];
      const base = token.endsWith("-foreground") ? token.slice(0, -"-foreground".length) : token;
      if (SEMANTIC_COLOR_NAMES[base] !== true) continue;
      if (defined.has(token)) continue;
      violations.push({
        file: filePath,
        line: index + 1,
        token,
        message: `undefined semantic color token "${match[0]}" (no --color-${token} in ${THEME_FILE})`,
      });
    }
  }
  return violations;
}

async function collectFiles() {
  const files: string[] = [];
  const glob = new Glob(`${ADMIN_ROOT}**/*.{ts,tsx}`);
  for await (const file of glob.scan({ cwd: ROOT, absolute: false })) files.push(file);
  return files.sort();
}

async function main() {
  const defined = readDefinedColorTokens(readFileSync(path.join(ROOT, THEME_FILE), "utf8"));
  const files = await collectFiles();
  const violations: SemanticTokenViolation[] = [];
  for (const relativeFile of files) {
    const source = readFileSync(path.join(ROOT, relativeFile), "utf8");
    violations.push(...scanSource(source, relativeFile, defined));
  }

  if (violations.length > 0) {
    console.error("Admin semantic color token check failed:");
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
    }
    process.exit(1);
  }

  console.log(
    `Admin semantic color token check passed for ${files.length} files (${defined.size} tokens).`
  );
}

if (import.meta.main) await main();
