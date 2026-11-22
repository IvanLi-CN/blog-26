import * as yaml from "js-yaml";
import { parseFrontmatterDocument } from "@/lib/frontmatter-document";

export type FrontmatterChoice = "base" | "local" | "remote";

/**
 * Rewrite one frontmatter key in an editor document. Used by the merge surface so a
 * field decision stays part of the same text the administrator finally saves.
 */
export function applyFrontmatterChoice(text: string, key: string, value: unknown): string {
  const parsed = parseFrontmatterDocument(text);
  if (!parsed.hasFrontmatter) return text;
  let data: Record<string, unknown>;
  try {
    const loaded = yaml.load(parsed.frontmatterText, { schema: yaml.JSON_SCHEMA });
    data = loaded && typeof loaded === "object" ? (loaded as Record<string, unknown>) : {};
  } catch {
    return text;
  }
  if (value === undefined || value === null) delete data[key];
  else data[key] = value;
  const block = yaml
    .dump(data, { schema: yaml.JSON_SCHEMA, lineWidth: -1, noRefs: true })
    .replace(/\n*$/u, "");
  return `---\n${block}\n---\n${parsed.body}`;
}

export function pickFrontmatterValue(
  field: { base: unknown; local: unknown; remote: unknown },
  choice: FrontmatterChoice
): unknown {
  if (choice === "base") return field.base;
  if (choice === "local") return field.local;
  return field.remote;
}
