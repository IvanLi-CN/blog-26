import yaml from "js-yaml";

type ParsedFrontmatterDocument = {
  frontmatter: Record<string, unknown>;
  frontmatterText: string;
  body: string;
  hasFrontmatter: boolean;
};

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/;

function normalizeContent(content: string) {
  return content.replace(/\r\n/g, "\n");
}

export function parseFrontmatterDocument(content: string): ParsedFrontmatterDocument {
  const normalized = normalizeContent(content);
  const match = normalized.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      frontmatter: {},
      frontmatterText: "",
      body: normalized,
      hasFrontmatter: false,
    };
  }

  const [, frontmatterText, body = ""] = match;
  try {
    const parsed = yaml.load(frontmatterText);
    return {
      frontmatter:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {},
      frontmatterText,
      body,
      hasFrontmatter: true,
    };
  } catch {
    return {
      frontmatter: {},
      frontmatterText,
      body,
      hasFrontmatter: true,
    };
  }
}

export function stringifyFrontmatterDocument(body: string, frontmatterText: string): string {
  const normalizedBody = normalizeContent(body);
  const normalizedFrontmatter = normalizeContent(frontmatterText);

  if (normalizedFrontmatter.length === 0) {
    return normalizedBody;
  }

  const separator = normalizedBody.startsWith("\n") || normalizedBody.length === 0 ? "" : "\n";
  return `---\n${normalizedFrontmatter}\n---\n${separator}${normalizedBody}`;
}

export function updateFrontmatterDocument(
  originalContent: string,
  nextFrontmatterText: string
): string {
  const { body } = parseFrontmatterDocument(originalContent);
  return stringifyFrontmatterDocument(body, nextFrontmatterText);
}

export function updateDocumentBody(originalContent: string, nextBody: string): string {
  const { frontmatterText } = parseFrontmatterDocument(originalContent);
  return stringifyFrontmatterDocument(nextBody, frontmatterText);
}

export function parseFrontmatterMap(content: string): Record<string, string> {
  const { frontmatter } = parseFrontmatterDocument(content);

  return Object.entries(frontmatter).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value === null || value === undefined) return acc;
    if (typeof value === "string") {
      acc[key] = value;
      return acc;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      acc[key] = String(value);
      return acc;
    }
    if (Array.isArray(value)) {
      acc[key] = value.join(", ");
      return acc;
    }
    acc[key] = JSON.stringify(value);
    return acc;
  }, {});
}

export function stripFrontmatter(content: string) {
  return parseFrontmatterDocument(content).body;
}
